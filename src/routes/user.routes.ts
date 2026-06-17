import { Router } from "express";
import { body, param } from "express-validator";
import * as userController from "../controllers/user.controller";
import * as pushTokenController from "../controllers/pushToken.controller";
import * as deliveryController from "../controllers/delivery.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { uploadMemoryStorage } from "../controllers/upload.controller";
import { MAX_FCM_TOKEN_LEN } from "../services/fcmPush.service";

const router = Router();

// All routes require authentication
router.use(requireAuth);

router.post("/fcm-token", pushTokenController.registerFcmToken);
router.get("/fcm-token/status", pushTokenController.getFcmTokenStatus);

// Multer only for multipart (so Form Data is parsed into req.body + req.file)
const optionalMultipartProfile = (req: any, res: any, next: any) => {
  if (!req.is("multipart/form-data")) return next();
  return uploadMemoryStorage.single("profileImage")(req, res, next);
};

// GET /api/user/profile - Get user profile
router.get("/profile", userController.getProfile);

// PUT /api/user/profile - Update user profile (JSON or multipart/form-data)
router.put(
  "/profile",
  optionalMultipartProfile,
  validate([
    body("name").optional().notEmpty().trim().isLength({ max: 255 }),
    body("restaurantName")
      .optional({ values: "null" })
      .custom((value) => {
        if (value === null || value === undefined) return true;
        if (typeof value !== "string") return false;
        return value.trim().length <= 255;
      }),
    body("phone").optional().isString().trim().isLength({ max: 50 }),
    body("phoneNumber").optional().isString().trim().isLength({ max: 50 }),
    body("country").optional().isString().trim().isLength({ max: 100 }),
    body("dateOfBirth").optional().isISO8601().toDate(),
    body("gender").optional().isIn(["male", "female", "other"]),
    body("address").optional().isString().trim().isLength({ max: 500 }),
    body("profileImage").optional().isString().trim().isLength({ max: 500 }),
    body("deliveryOn").optional().isBoolean(),
    body("deliveryPhone").optional().isString().trim().isLength({ max: 50 }),
    body("fcmToken")
      .optional({ values: "null" })
      .custom((value) => {
        if (value === null || value === undefined || value === "") return true;
        if (typeof value !== "string") return false;
        return value.trim().length <= MAX_FCM_TOKEN_LEN;
      }),
  ]),
  userController.updateProfile,
);

// GET /api/user/delivery/settings - Delivery toggle, phone, and governorates
router.get("/delivery/settings", deliveryController.getDeliverySettings);

// PUT /api/user/delivery/settings - Update delivery toggle and phone
router.put(
  "/delivery/settings",
  validate([
    body("deliveryOn").optional().isBoolean(),
    body("deliveryPhone").optional().isString().trim().isLength({ max: 50 }),
  ]),
  deliveryController.updateDeliverySettings,
);

// GET /api/user/delivery/governorates
router.get("/delivery/governorates", deliveryController.getDeliveryGovernorates);

// POST /api/user/delivery/governorates
router.post(
  "/delivery/governorates",
  validate([
    body("nameAr").notEmpty().trim().isLength({ max: 255 }),
    body("nameEn").notEmpty().trim().isLength({ max: 255 }),
    body("price").isFloat({ min: 0 }),
    body("lat").optional({ values: "null" }).isFloat({ min: -90, max: 90 }),
    body("lan").optional({ values: "null" }).isFloat({ min: -180, max: 180 }),
    body("lng").optional({ values: "null" }).isFloat({ min: -180, max: 180 }),
  ]),
  deliveryController.createDeliveryGovernorate,
);

// PUT /api/user/delivery/governorates/:governorateId
router.put(
  "/delivery/governorates/:governorateId",
  validate([
    param("governorateId").isInt(),
    body("nameAr").optional().notEmpty().trim().isLength({ max: 255 }),
    body("nameEn").optional().notEmpty().trim().isLength({ max: 255 }),
    body("price").optional().isFloat({ min: 0 }),
    body("lat").optional({ values: "null" }).isFloat({ min: -90, max: 90 }),
    body("lan").optional({ values: "null" }).isFloat({ min: -180, max: 180 }),
    body("lng").optional({ values: "null" }).isFloat({ min: -180, max: 180 }),
  ]),
  deliveryController.updateDeliveryGovernorate,
);

// DELETE /api/user/delivery/governorates/:governorateId
router.delete(
  "/delivery/governorates/:governorateId",
  validate([param("governorateId").isInt()]),
  deliveryController.deleteDeliveryGovernorate,
);

// POST /api/user/change-password - Change password
router.post(
  "/change-password",
  validate([
    body("currentPassword").notEmpty(),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ]),
  userController.changePassword,
);

// GET /api/user/statistics - Get user statistics
router.get("/statistics", userController.getStatistics);

// GET /api/user/plans - Plans with personalized Pro intro pricing
router.get("/plans", userController.getPlans);

// GET /api/user/subscription - Get user subscription
router.get("/subscription", userController.getSubscription);

// POST /api/user/subscription/recover-payment - Complete pending Pro payment & activate plan
router.post(
  "/subscription/recover-payment",
  userController.recoverSubscriptionPayment,
);

// POST /api/user/subscription/downgrade-to-free - Downgrade to Free plan
router.post(
  "/subscription/downgrade-to-free",
  userController.downgradeToFree,
);

// POST /api/user/upgrade-plan - Upgrade subscription plan
router.post(
  "/upgrade-plan",
  validate([body("planType").isIn(["free", "monthly", "yearly"])]),
  userController.upgradePlan,
);

// DELETE /api/user/account - Delete user account
router.delete(
  "/account",
  validate([body("password").notEmpty()]),
  userController.deleteAccount,
);

export default router;
