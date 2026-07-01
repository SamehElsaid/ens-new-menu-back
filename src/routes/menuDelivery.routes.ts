import { Router } from "express";
import { body, param } from "express-validator";
import * as menuDeliveryController from "../controllers/menuDelivery.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { requireProPlan } from "../middleware/planLimits";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireProPlan);

router.get(
  "/settings",
  [param("menuId").isInt()],
  menuDeliveryController.getMenuDeliverySettings,
);

router.put(
  "/settings",
  validate([
    param("menuId").isInt(),
    body("deliveryOn").optional().isBoolean(),
    body("deliveryWhatsAppOn").optional().isBoolean(),
    body("deliveryPhone").optional().isString().trim().isLength({ max: 50 }),
  ]),
  menuDeliveryController.updateMenuDeliverySettings,
);

router.get(
  "/governorates",
  [param("menuId").isInt()],
  menuDeliveryController.getMenuDeliveryGovernorates,
);

router.post(
  "/governorates",
  validate([
    param("menuId").isInt(),
    body("nameAr").notEmpty().trim().isLength({ max: 255 }),
    body("nameEn").notEmpty().trim().isLength({ max: 255 }),
    body("price").isFloat({ min: 0 }),
    body("lat").optional({ nullable: true }),
    body("lan").optional({ nullable: true }),
    body("lng").optional({ nullable: true }),
  ]),
  menuDeliveryController.createMenuDeliveryGovernorate,
);

router.put(
  "/governorates/:governorateId",
  validate([
    param("menuId").isInt(),
    param("governorateId").isInt(),
    body("nameAr").optional().trim().isLength({ max: 255 }),
    body("nameEn").optional().trim().isLength({ max: 255 }),
    body("price").optional().isFloat({ min: 0 }),
    body("lat").optional({ nullable: true }),
    body("lan").optional({ nullable: true }),
    body("lng").optional({ nullable: true }),
  ]),
  menuDeliveryController.updateMenuDeliveryGovernorate,
);

router.delete(
  "/governorates/:governorateId",
  validate([param("menuId").isInt(), param("governorateId").isInt()]),
  menuDeliveryController.deleteMenuDeliveryGovernorate,
);

export default router;
