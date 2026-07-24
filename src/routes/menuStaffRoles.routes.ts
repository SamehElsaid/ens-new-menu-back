import { Router } from "express";
import { body, param } from "express-validator";
import * as rolesController from "../controllers/menuStaffRoles.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePlanCapability } from "../middleware/planLimits";

// mergeParams so :menuId (mounted in menu.routes) is available here.
const router = Router({ mergeParams: true });

// Roles management mirrors staff CRUD gating.
router.use(requireAuth);
router.use(requirePlanCapability("staffAndTables"));

// GET /api/menus/:menuId/staff-roles
router.get(
  "/",
  validate([param("menuId").isInt()]),
  rolesController.listStaffRoles,
);

// GET /api/menus/:menuId/staff-roles/:roleId
router.get(
  "/:roleId",
  validate([param("menuId").isInt(), param("roleId").isInt()]),
  rolesController.getStaffRoleById,
);

// POST /api/menus/:menuId/staff-roles
router.post(
  "/",
  validate([
    param("menuId").isInt(),
    body("name").isString().trim().isLength({ min: 1, max: 100 }),
    body("permissions").optional().isArray(),
    body("permissions.*").optional().isString(),
    body("loginPortal").optional().isIn(["staff_app", "dashboard"]),
  ]),
  rolesController.createStaffRole,
);

// PUT /api/menus/:menuId/staff-roles/:roleId
router.put(
  "/:roleId",
  validate([
    param("menuId").isInt(),
    param("roleId").isInt(),
    body("name").optional().isString().trim().isLength({ min: 1, max: 100 }),
    body("permissions").optional().isArray(),
    body("permissions.*").optional().isString(),
    body("loginPortal").optional().isIn(["staff_app", "dashboard"]),
  ]),
  rolesController.updateStaffRole,
);

// DELETE /api/menus/:menuId/staff-roles/:roleId
router.delete(
  "/:roleId",
  validate([param("menuId").isInt(), param("roleId").isInt()]),
  rolesController.deleteStaffRole,
);

export default router;
