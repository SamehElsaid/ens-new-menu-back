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

const staffEmailBody = body("email")
  .optional({ nullable: true, checkFalsy: true })
  .isEmail()
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
    staffEmailBody,
    body("password").optional().isString().isLength({ min: 6, max: 128 }),
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
    staffEmailBody,
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
