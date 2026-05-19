import { Router } from "express";
import { body, query } from "express-validator";
import {
  getPublicMenu,
  getAllPublicMenus,
  submitRating,
  getRecentRatings,
  getActiveAds,
  getMenuCustomAds,
  getPublicPlans,
} from "../controllers/public.controller";
import {
  postAppVersion,
  getLatestVersion,
  getPublicAppVersion,
} from "../controllers/version.controller";
import { postGuestStaffCall } from "../controllers/guestStaffCall.controller";
import { validate } from "../middleware/validation";
import { publicLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/public/staff-call — بدون publicLimiter (طلب نداء الطاقم فقط)
router.post(
  "/staff-call",
  validate([
    body("menuId").isInt({ min: 1 }).toInt(),
    body("tableNumber").isString().trim().notEmpty().isLength({ min: 1, max: 50 }),
    body("status")
      .optional()
      .isIn(["pending", "confirmed", "cancelled"])
      .withMessage("status must be pending, confirmed, or cancelled"),
  ]),
  postGuestStaffCall,
);

// Apply rate limiting to the rest of public routes
router.use(publicLimiter);

// GET /api/public/menus - Get all menus (no token)
router.get("/menus", getAllPublicMenus);

// GET /api/public/menu/:slug - Get menu by slug
router.get(
  "/menu/:slug",
  [
    query("locale")
      .optional()
      .isIn(["ar", "en"])
      .withMessage("Locale must be ar or en"),
    query("tableNumber")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 })
      .withMessage("tableNumber must be at most 50 characters"),
    query("table")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 })
      .withMessage("table must be at most 50 characters"),
    query("tableId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("tableId must be a positive integer"),
  ],
  getPublicMenu
);

// GET /api/public/menu/:slug/ratings - Get recent ratings
router.get("/menu/:slug/ratings", getRecentRatings);

// POST /api/public/menu/:slug/rate - Add rating
router.post(
  "/menu/:slug/rate",
  validate([
    body("stars")
      .isInt({ min: 1, max: 5 })
      .withMessage("Stars must be between 1 and 5"),
    body("comment").optional().isString().trim().isLength({ max: 1000 }),
    body("customerName").optional().isString().trim().isLength({ max: 255 }),
  ]),
  submitRating
);

// GET /api/public/ads - Get active global ads
router.get(
  "/ads",
  [
    query("position").optional().isString(),
    query("limit").optional().isInt({ min: 1, max: 20 }),
  ],
  getActiveAds
);

// GET /api/public/menu/:menuId/ads - Get menu custom ads
router.get(
  "/menu/:menuId/ads",
  [
    query("position").optional().isString(),
    query("limit").optional().isInt({ min: 1, max: 20 }),
  ],
  getMenuCustomAds
);

// GET /api/public/plans - Get all active plans
router.get("/plans", getPublicPlans);

// POST /api/public/version - App version check (mobile clients)
router.post("/version", postAppVersion);

// GET /api/public/version/latest - Returns the most recently added version record
router.get("/version/latest", getLatestVersion);

// GET /api/public/app-version - Latest app version (no auth)
router.get("/app-version", getPublicAppVersion);

export default router;
