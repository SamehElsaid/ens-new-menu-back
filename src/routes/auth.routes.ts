import { Router } from "express";
import { body } from "express-validator";
import * as authController from "../controllers/auth.controller";
import { validate } from "../middleware/validation";
import { validateRequest } from "../middleware/zodValidation";
import {
  signupSchema,
  checkAvailabilitySchema,
  loginSchema,
  resetPasswordSchema,
  verifyPhoneSchema,
  resendPhoneVerificationSchema,
  addPhoneSchema,
} from "../validators/auth.validator";
import {
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  phoneVerificationLimiter,
} from "../middleware/rateLimiter";
import { requireAuth } from "../middleware/auth.middleware";
import { MAX_FCM_TOKEN_LEN } from "../services/fcmPush.service";

const router = Router();

// GET /api/auth/check-availability?email=xxx&phoneNumber=xxx
router.get(
  "/check-availability",
  validateRequest(checkAvailabilitySchema, "query"),
  authController.checkAvailability,
);

// POST /api/auth/signup
router.post(
  "/signup",
  authLimiter,
  validateRequest(signupSchema, "body"),
  authController.signup,
);

// POST /api/auth/login
router.post(
  "/login",
  authLimiter,
  validateRequest(loginSchema, "body"),
  authController.login,
);

// POST /api/auth/add-phone — save phone + send WhatsApp OTP (authenticated)
router.post(
  "/add-phone",
  requireAuth,
  validateRequest(addPhoneSchema, "body"),
  authController.addPhone,
);

// POST /api/auth/verify-phone
router.post(
  "/verify-phone",
  validateRequest(verifyPhoneSchema, "body"),
  authController.verifyPhone,
);

// POST /api/auth/resend-phone-verification
router.post(
  "/resend-phone-verification",
  phoneVerificationLimiter,
  validateRequest(resendPhoneVerificationSchema, "body"),
  authController.resendPhoneVerification,
);

// GET /api/auth/verify-email?token=xxx
router.get("/verify-email", authController.verifyEmail);

// POST /api/auth/resend-verification
router.post(
  "/resend-verification",
  emailVerificationLimiter,
  validate([
    body("email").isEmail().normalizeEmail(),
    body("locale").optional().isIn(["ar", "en"]),
  ]),
  authController.resendVerification,
);

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  passwordResetLimiter,
  validate([
    body("email").isEmail().normalizeEmail(),
    body("locale").optional().isIn(["ar", "en"]),
  ]),
  authController.forgotPassword,
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  validateRequest(resetPasswordSchema, "body"),
  authController.resetPassword,
);

// GET /api/auth/me - Protected route
router.get("/me", requireAuth, authController.getMe);

// POST /api/auth/me/fcm-token-match — body: { fcmToken }; `{ matches }` vs Users.fcmToken
router.post(
  "/me/fcm-token-match",
  requireAuth,
  validate([
    body("fcmToken")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("fcmToken is required")
      .isLength({ max: MAX_FCM_TOKEN_LEN }),
  ]),
  authController.verifyFcmTokenMatch,
);

// POST /api/auth/refresh - Refresh access token
router.post(
  "/refresh",
  validate([
    body("refreshToken").notEmpty().withMessage("Refresh token is required"),
  ]),
  authController.refreshToken,
);

// POST /api/auth/logout - Logout (revoke tokens)
router.post("/logout", requireAuth, authController.logout);

export default router;
