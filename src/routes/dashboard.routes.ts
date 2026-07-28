import { Router, type NextFunction, type Request, type Response } from "express";
import { body, param, query } from "express-validator";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { hasCapability } from "../services/planCapabilities.service";
import { resolveOwnerUserId } from "../services/staffMenuGrants.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import type { BooleanCapabilityKey } from "../types/planCapabilities";
import { listDashboardMenusHandler } from "../controllers/dashboardMenus.controller";
import {
  getDashboardOrderHandler,
  listDashboardOrdersHandler,
} from "../controllers/dashboardOrders.controller";
import {
  createAccountStaffHandler,
  deleteAccountStaffHandler,
  getAccountStaffByIdHandler,
  listAccountStaffHandler,
  updateAccountStaffHandler,
} from "../controllers/dashboardStaff.controller";
import {
  createAccountStaffRoleHandler,
  deleteAccountStaffRoleHandler,
  getAccountStaffRoleHandler,
  listAccountStaffRolesHandler,
  updateAccountStaffRoleHandler,
} from "../controllers/dashboardStaffRoles.controller";

/**
 * Account-level dashboard API: orders and staff span every menu the actor may
 * see, instead of being scoped to a single `:menuId` in the path.
 */
const router = Router();

router.use(requireAuth);

/**
 * Plan gate for account-level routes. `requirePlanCapability` reads
 * `:menuId` / `req.user.userId`, neither of which identifies the account here —
 * a staff `userId` is a `MenuStaff.id`, not a `Users.id`.
 */
function requireAccountCapability(key: BooleanCapabilityKey) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = req.user!;
      const ownerUserId = await resolveOwnerUserId({
        userId: auth.userId,
        role: auth.role,
      });
      if (ownerUserId != null && (await hasCapability(ownerUserId, key))) {
        next();
        return;
      }
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: key,
      });
    } catch {
      sendApiError(res, req, 500, ApiErrors.failedVerifySubscription);
    }
  };
}

// GET /api/dashboard/menus
router.get("/menus", listDashboardMenusHandler);

// GET /api/dashboard/orders
router.get(
  "/orders",
  validate([
    query("channel").optional().isIn(["table", "delivery"]),
    query("menuId").optional().isInt({ min: 1 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("q").optional().isString().trim().isLength({ max: 100 }),
    query("search").optional().isString().trim().isLength({ max: 100 }),
    query("direction").optional().isIn(["asc", "desc"]),
  ]),
  listDashboardOrdersHandler,
);

// GET /api/dashboard/orders/:entryId
router.get(
  "/orders/:entryId",
  validate([param("entryId").isInt({ min: 1 })]),
  getDashboardOrderHandler,
);

const staffIdParam = param("staffId").isInt({ min: 1 });
const roleIdParam = param("roleId").isInt({ min: 1 });
const menuGrantsBody = body("menuIds")
  .isArray({ min: 1 })
  .withMessage("menuIds must contain at least one menu");

// /api/dashboard/staff — staff management is a Pro capability
router.use(["/staff", "/staff-roles"], requireAccountCapability("staffAndTables"));

router.get("/staff", listAccountStaffHandler);
router.get("/staff/:staffId", validate([staffIdParam]), getAccountStaffByIdHandler);
router.post(
  "/staff",
  validate([
    body("name").notEmpty().trim().isLength({ max: 255 }),
    body("roleId").isInt({ min: 1 }),
    body("email").trim().notEmpty().bail().isEmail().normalizeEmail(),
    body("password").isString().isLength({ min: 6, max: 128 }),
    body("phone").optional().isString().trim().isLength({ max: 50 }),
    body("isActive").optional().isBoolean(),
    menuGrantsBody,
  ]),
  createAccountStaffHandler,
);
router.put(
  "/staff/:staffId",
  validate([
    staffIdParam,
    body("name").optional().notEmpty().trim().isLength({ max: 255 }),
    body("roleId").optional().isInt({ min: 1 }),
    body("email").optional().trim().notEmpty().bail().isEmail().normalizeEmail(),
    body("password").optional().isString().isLength({ min: 6, max: 128 }),
    body("phone").optional().isString().trim().isLength({ max: 50 }),
    body("isActive").optional().isBoolean(),
    body("menuIds").optional().isArray({ min: 1 }),
  ]),
  updateAccountStaffHandler,
);
router.delete(
  "/staff/:staffId",
  validate([staffIdParam]),
  deleteAccountStaffHandler,
);

// /api/dashboard/staff-roles
router.get("/staff-roles", listAccountStaffRolesHandler);
router.get(
  "/staff-roles/:roleId",
  validate([roleIdParam]),
  getAccountStaffRoleHandler,
);
router.post(
  "/staff-roles",
  validate([
    body("name").notEmpty().trim().isLength({ max: 100 }),
    body("nameEn").optional().isString().trim().isLength({ max: 100 }),
    body("permissions").optional().isArray(),
    body("loginPortal").optional().isIn(["staff_app", "dashboard"]),
  ]),
  createAccountStaffRoleHandler,
);
router.put(
  "/staff-roles/:roleId",
  validate([
    roleIdParam,
    body("name").optional().notEmpty().trim().isLength({ max: 100 }),
    body("nameEn").optional().isString().trim().isLength({ max: 100 }),
    body("permissions").optional().isArray(),
    body("loginPortal").optional().isIn(["staff_app", "dashboard"]),
  ]),
  updateAccountStaffRoleHandler,
);
router.delete(
  "/staff-roles/:roleId",
  validate([roleIdParam]),
  deleteAccountStaffRoleHandler,
);

export default router;
