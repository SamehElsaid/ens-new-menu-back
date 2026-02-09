import { Router } from "express";
import { body, query, param } from "express-validator";
import * as menuController from "../controllers/menu.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { checkMenuLimit } from "../middleware/planLimits";
import menuItemRoutes from "./menuItem.routes";
import branchRoutes from "./branch.routes";
import menuCustomizationRoutes from "./menuCustomization.routes";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/menus/check-slug - Check slug availability
router.get(
  "/check-slug",
  [query("slug").notEmpty().trim().isLength({ min: 3, max: 100 })],
  menuController.checkSlugAvailability
);

// GET /api/menus - Get user's menus
router.get(
  "/",
  [query("locale").optional().isIn(["ar", "en"])],
  menuController.getUserMenus
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
    body("logo").optional().isString().isLength({ max: 500 }),
    body("theme").optional().isIn(["default", "neon", "coffee", "sky"]),
  ]),
  menuController.createMenu
);

// GET /api/menus/:id - Get menu by ID
router.get("/:id", [param("id").isInt()], menuController.getMenuById);

// PUT /api/menus/:id - Update menu
router.put(
  "/:id",
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
    body("theme").optional().isIn(["default", "neon", "coffee", "sky"]),
    body("currency").optional().isString().isLength({ min: 3, max: 3 }),
    body("isActive").optional().isBoolean(),
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
  menuController.updateMenu
);

// PATCH /api/menus/:id/status - Toggle menu status
router.patch(
  "/:id/status",
  [param("id").isInt()],
  menuController.toggleMenuStatus
);

// DELETE /api/menus/:id - Delete menu
router.delete("/:id", [param("id").isInt()], menuController.deleteMenu);

// Nested routes
router.use("/:menuId/items", menuItemRoutes);
router.use("/:menuId/branches", branchRoutes);
router.use("/:menuId/customizations", menuCustomizationRoutes);

export default router;
