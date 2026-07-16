import { Router } from "express";
import { body, query, param } from "express-validator";
import * as menuController from "../controllers/menu.controller";
import * as menuActivityLogController from "../controllers/menuActivityLog.controller";
import { getMenuAnalytics } from "../controllers/menuAnalytics.controller";
import { listMenuRatingsHandler } from "../controllers/menuRatings.controller";
import { ALLOWED_MENU_THEMES } from "../constants/menuThemes";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { checkMenuLimit } from "../middleware/planLimits";
import menuItemRoutes from "./menuItem.routes";
import branchRoutes from "./branch.routes";
import menuCustomizationRoutes from "./menuCustomization.routes";
import menuStaffRoutes from "./menuStaff.routes";
import menuStaffRolesRoutes from "./menuStaffRoles.routes";
import menuTablesRoutes from "./menuTables.routes";
import menuDeliveryRoutes from "./menuDelivery.routes";
import {
  resolveMenuParam,
  resolveMenuIdRouteParam,
} from "../middleware/resolveMenuIdentifier.middleware";

const router = Router();

router.param("menuId", resolveMenuParam);

// All routes require authentication
router.use(requireAuth);

// GET /api/menus/check-slug - Check slug availability
router.get(
  "/check-slug",
  [query("slug").notEmpty().trim().isLength({ min: 3, max: 100 })],
  menuController.checkSlugAvailability,
);

// GET /api/menus - Get user's menus
router.get(
  "/",
  [query("locale").optional().isIn(["ar", "en"])],
  menuController.getUserMenus,
);

// POST /api/menus - Create new menu
router.post(
  "/",
  checkMenuLimit,
  validate([
    body("nameAr").notEmpty().trim().isLength({ max: 255 }),
    body("nameEn").notEmpty().trim().isLength({ max: 255 }),
    body("descriptionAr").optional().isString().trim().isLength({ max: 1000 }),
    body("descriptionEn").optional().isString().trim().isLength({ max: 1000 }),
    body("slug").optional().isString().trim().isLength({ max: 200 }),
    body("logo").notEmpty().trim().isString().isLength({ max: 500 }),
    body("theme")
      .optional()
      .trim()
      .isIn([...ALLOWED_MENU_THEMES]),
  ]),
  menuController.createMenu,
);

// POST /api/menus/:menuId/copy — Copy menu with optional sections
router.post(
  "/:menuId/copy",
  checkMenuLimit,
  validate([
    param("menuId").isInt(),
    body("nameAr").notEmpty().trim().isLength({ max: 255 }),
    body("nameEn").notEmpty().trim().isLength({ max: 255 }),
    body("slug").notEmpty().trim().isLength({ min: 3, max: 100 }),
    body("copyProducts").optional().isBoolean(),
    body("copySettings").optional().isBoolean(),
    body("copyDesign").optional().isBoolean(),
    body("copyMedia").optional().isBoolean(),
    body("copyAddress").optional().isBoolean(),
  ]),
  menuController.copyMenu,
);

// GET /api/menus/:menuId/analytics — Pro menu analytics (owner)
router.get(
  "/:menuId/analytics",
  validate([
    param("menuId").isInt(),
    query("period").optional().isIn(["7d", "30d", "90d"]),
  ]),
  getMenuAnalytics,
);

// GET /api/menus/:menuId/ratings — customer ratings for this menu (owner / cashier)
router.get(
  "/:menuId/ratings",
  validate([
    param("menuId").isInt(),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("q").optional().isString().trim().isLength({ max: 100 }),
    query("search").optional().isString().trim().isLength({ max: 100 }),
  ]),
  listMenuRatingsHandler,
);

// GET /api/menus/:menuId/audit-logs — menu audit trail (create/update/delete)
router.get(
  "/:menuId/audit-logs",
  validate([
    param("menuId").isInt(),
    query("page").optional().isInt(),
    query("limit").optional().isInt(),
    query("q").optional().isString().trim().isLength({ max: 100 }),
    query("search").optional().isString().trim().isLength({ max: 100 }),
  ]),
  menuActivityLogController.listMenuAuditLogsHandler,
);

// GET /api/menus/:menuId/activity-logs/:id — single activity log entry
router.get(
  "/:menuId/activity-logs/:id",
  validate([param("menuId").isInt(), param("id").isInt()]),
  menuActivityLogController.getMenuActivityLogByIdHandler,
);

// POST /api/menus/:menuId/activity-logs/:id/actions — accept / reject / prepare / deliver / complete
router.post(
  "/:menuId/activity-logs/:id/actions",
  validate([
    param("menuId").isInt(),
    param("id").isInt(),
    body("action")
      .isString()
      .trim()
      .isIn([
        "TABLE_CALL_CONFIRMED",
        "TABLE_CALL_CANCELLED",
        "TABLE_CALL_PREPARED",
        "TABLE_CALL_DELIVERED",
        "TABLE_CALL_COMPLETED",
      ]),
  ]),
  menuActivityLogController.postMenuOrderActionHandler,
);

// PATCH|PUT /api/menus/:menuId/activity-logs/:id/items — edit order lines
// (dashboard axiosPatch uses HTTP PUT)
const patchMenuOrderItemsValidators = validate([
  param("menuId").isInt(),
  param("id").isInt(),
]);
router.patch(
  "/:menuId/activity-logs/:id/items",
  patchMenuOrderItemsValidators,
  menuActivityLogController.patchMenuOrderItemsHandler,
);
router.put(
  "/:menuId/activity-logs/:id/items",
  patchMenuOrderItemsValidators,
  menuActivityLogController.patchMenuOrderItemsHandler,
);

// GET /api/menus/:menuId/activity-logs — audit trail (owner / authorised staff)
router.get(
  "/:menuId/activity-logs",
  validate([
    param("menuId").isInt(),
    query("page").optional().isInt(),
    query("limit").optional().isInt(),
    query("q").optional().isString().trim().isLength({ max: 100 }),
    query("search").optional().isString().trim().isLength({ max: 100 }),
  ]),
  menuActivityLogController.listMenuActivityLogsHandler,
);

// GET /api/menus/:id - Get menu by ID or UUID
router.get(
  "/:id",
  resolveMenuIdRouteParam,
  [param("id").isInt()],
  menuController.getMenuById,
);

// PUT /api/menus/:id - Update menu
router.put(
  "/:id",
  resolveMenuIdRouteParam,
  validate([
    param("id").isInt(),
    body("nameAr")
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 255 }),
    body("nameEn")
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isLength({ max: 255 }),
    body("descriptionAr")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .trim()
      .isLength({ max: 1000 }),
    body("descriptionEn")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .trim()
      .isLength({ max: 1000 }),
    body("logo")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .isLength({ max: 500 }),
    body("theme")
      .optional()
      .trim()
      .isIn([...ALLOWED_MENU_THEMES]),
    body("currency").optional().isString().isLength({ min: 3, max: 3 }),
    body("isActive").optional().isBoolean(),
    body("chatbotEnabled").optional().isBoolean(),
    body("wifiEnabled").optional().isBoolean(),
    body("wifiName")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .trim()
      .isLength({ max: 255 }),
    body("wifiPassword")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .trim()
      .isLength({ max: 255 }),
    body("taxEnabled").optional().isBoolean(),
    body("taxPercent")
      .optional({ nullable: true })
      .isFloat({ min: 0, max: 100 }),
    body("serviceEnabled").optional().isBoolean(),
    body("servicePercent")
      .optional({ nullable: true })
      .isFloat({ min: 0, max: 100 }),
    body("addressEn")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .trim()
      .isLength({ max: 500 }),
    body("addressAr")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .trim()
      .isLength({ max: 500 }),
    body("phone")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .trim()
      .isLength({ max: 50 }),
    body("workingHours").optional(),
  ]),
  menuController.updateMenu,
);

// PUT /api/menus/:id/status - Toggle menu status
router.put(
  "/:id/status",
  resolveMenuIdRouteParam,
  [param("id").isInt()],
  menuController.toggleMenuStatus,
);

// DELETE /api/menus/:id - Delete menu
router.delete(
  "/:id",
  resolveMenuIdRouteParam,
  [param("id").isInt()],
  menuController.deleteMenu,
);

// Nested routes
router.use("/:menuId/items", menuItemRoutes);
// Branch CRUD — no dashboard UI yet; Branches data is served via GET /api/public/menu/:slug
router.use("/:menuId/branches", branchRoutes);
router.use("/:menuId/customizations", menuCustomizationRoutes);
router.use("/:menuId/staff-roles", menuStaffRolesRoutes);
router.use("/:menuId/staff", menuStaffRoutes);
router.use("/:menuId/tables", menuTablesRoutes);
router.use("/:menuId/delivery", menuDeliveryRoutes);

export default router;
