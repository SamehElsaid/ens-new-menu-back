import { Router } from "express";
import { body, param } from "express-validator";
import * as staffController from "../controllers/menuStaff.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePlanCapability } from "../middleware/planLimits";

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requirePlanCapability("staffAndTables"));

const menuIdParam = param("menuId").isInt().withMessage("menuId must be an integer");
const staffIdParam = param("staffId")
  .isInt()
  .withMessage("staffId must be an integer");

// Email is the staff login identifier and the DB column is NOT NULL — required on create.
const staffEmailCreateBody = body("email")
  .trim()
  .notEmpty()
  .withMessage("email is required")
  .bail()
  .isEmail()
  .withMessage("email must be a valid email")
  .normalizeEmail();

// On update email is optional, but if sent it cannot be cleared (column is NOT NULL).
const staffEmailUpdateBody = body("email")
  .optional()
  .trim()
  .notEmpty()
  .withMessage("email cannot be empty")
  .bail()
  .isEmail()
  .withMessage("email must be a valid email")
  .normalizeEmail();

const staffRoleIdBody = body("roleId")
  .isInt({ min: 1 })
  .withMessage("roleId must be a valid role id");

const staffRoleIdOptionalBody = body("roleId")
  .optional()
  .isInt({ min: 1 })
  .withMessage("roleId must be a valid role id");

// GET /api/menus/:menuId/staff
router.get("/", validate([menuIdParam]), staffController.getStaff);

// GET /api/menus/:menuId/staff/:staffId
router.get(
  "/:staffId",
  validate([menuIdParam, staffIdParam]),
  staffController.getStaffById,
);

// POST /api/menus/:menuId/staff
router.post(
  "/",
  validate([
    menuIdParam,
    body("name").notEmpty().trim().isLength({ max: 255 }),
    staffRoleIdBody,
    body("phone").optional().isString().trim().isLength({ max: 50 }),
    staffEmailCreateBody,
    body("password")
      .isString()
      .withMessage("password is required")
      .bail()
      .isLength({ min: 6, max: 128 })
      .withMessage("password must be between 6 and 128 characters"),
    body("isActive").optional().isBoolean(),
  ]),
  staffController.createStaff,
);

// PUT /api/menus/:menuId/staff/:staffId
router.put(
  "/:staffId",
  validate([
    menuIdParam,
    staffIdParam,
    body("name").optional().notEmpty().trim().isLength({ max: 255 }),
    staffRoleIdOptionalBody,
    body("phone").optional().isString().trim().isLength({ max: 50 }),
    staffEmailUpdateBody,
    body("password").optional().isString().isLength({ min: 6, max: 128 }),
    body("isActive").optional().isBoolean(),
  ]),
  staffController.updateStaff,
);

// DELETE /api/menus/:menuId/staff/:staffId
router.delete(
  "/:staffId",
  validate([menuIdParam, staffIdParam]),
  staffController.deleteStaff,
);

export default router;
