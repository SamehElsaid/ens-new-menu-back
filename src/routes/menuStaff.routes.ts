import { Router } from "express";
import { body, param } from "express-validator";
import * as staffController from "../controllers/menuStaff.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { requireProPlan } from "../middleware/planLimits";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireProPlan);

// GET /api/menus/:menuId/staff
router.get("/", [param("menuId").isInt()], staffController.getStaff);

// GET /api/menus/:menuId/staff/:staffId
router.get(
  "/:staffId",
  [param("menuId").isInt(), param("staffId").isInt()],
  staffController.getStaffById
);

// POST /api/menus/:menuId/staff
router.post(
  "/",
  validate([
    param("menuId").isInt(),
    body("name").notEmpty().trim().isLength({ max: 255 }),
    body("role").optional().isString().trim().isLength({ max: 100 }),
    body("phone").optional().isString().trim().isLength({ max: 50 }),
    body("email").optional().isEmail().normalizeEmail(),
    body("password").optional().isString().isLength({ min: 6, max: 128 }),
    body("isActive").optional().isBoolean(),
  ]),
  staffController.createStaff
);

// PUT /api/menus/:menuId/staff/:staffId
router.put(
  "/:staffId",
  validate([
    param("menuId").isInt(),
    param("staffId").isInt(),
    body("name").optional().notEmpty().trim().isLength({ max: 255 }),
    body("role").optional().isString().trim().isLength({ max: 100 }),
    body("phone").optional().isString().trim().isLength({ max: 50 }),
    body("email").optional().isEmail().normalizeEmail(),
    body("password").optional().isString().isLength({ min: 6, max: 128 }),
    body("isActive").optional().isBoolean(),
  ]),
  staffController.updateStaff
);

// DELETE /api/menus/:menuId/staff/:staffId
router.delete(
  "/:staffId",
  [param("menuId").isInt(), param("staffId").isInt()],
  staffController.deleteStaff
);

export default router;
