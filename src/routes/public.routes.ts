import { Router } from "express";
import { body, param, query } from "express-validator";
import {
  getPublicMenu,
  getAllPublicMenus,
  submitRating,
  getRecentRatings,
  getActiveAds,
  getMenuCustomAds,
  getPublicPlans,
  getMenuView,
  postMenuItemView,
  postAdClick,
  getHomepageFeaturedLogos,
} from "../controllers/public.controller";
import {
  postAppVersion,
  getLatestVersion,
  getPublicAppVersion,
} from "../controllers/version.controller";
import { postGuestStaffCall } from "../controllers/guestStaffCall.controller";
import { postMenuBrandingEvent } from "../controllers/brandingEvent.controller";
import { validate } from "../middleware/validation";
import { publicLimiter } from "../middleware/rateLimiter";

const router = Router();

// GET app version — before rate limiter (fully public)
router.get("/app-version", getPublicAppVersion);
router.get("/app-version/latest", getPublicAppVersion);

// POST /api/public/staff-call — بدون publicLimiter (طلب نداء الطاقم فقط)
router.post(
  "/staff-call",
  validate([
    body("menuId").isInt({ min: 1 }).toInt(),
    body("type").optional().isIn(["table", "delivery"]),
    body("tableNumber").optional().isString().trim().isLength({ max: 50 }),
    body("customerName").optional().isString().trim().isLength({ max: 200 }),
    body("customerPhone").optional().isString().trim().isLength({ max: 50 }),
    body("customerAddress").optional().isString().trim().isLength({ max: 500 }),
    body("orderNotes").optional().isString().trim().isLength({ max: 500 }),
    body("governorateId").optional().isInt({ min: 1 }).toInt(),
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

// POST /api/public/menus/:slug/branding-events — free-plan ENSmenu banner tracking
router.post(
  "/menus/:slug/branding-events",
  validate([
    body("type")
      .isIn(["impression", "click"])
      .withMessage("type must be impression or click"),
  ]),
  postMenuBrandingEvent,
);

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
    query("src")
      .optional()
      .isIn(["qr"])
      .withMessage("src must be qr when provided"),
  ],
  getPublicMenu
);

// GET /api/public/menu/:slug/view — page view (+1 qr scan when ?qr or ?src=qr)
router.get(
  "/menu/:slug/view",
  [
    query("src")
      .optional()
      .isIn(["qr"])
      .withMessage("src must be qr when provided"),
    query("qr").optional(),
  ],
  getMenuView,
);

// POST /api/public/menu/:slug/items/:itemId/view — product card click
router.post(
  "/menu/:slug/items/:itemId/view",
  postMenuItemView,
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

// POST /api/public/ads/:id/click — track ad click (public menu)
router.post(
  "/ads/:id/click",
  validate([
    param("id").isInt({ min: 1 }).withMessage("id must be a positive integer"),
  ]),
  postAdClick,
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

// GET /api/public/homepage-featured-logos - Trusted-by logos on landing page
router.get("/homepage-featured-logos", getHomepageFeaturedLogos);

// POST /api/public/version - App version check (mobile clients)
router.post("/version", postAppVersion);

// GET /api/public/version/latest - Returns the most recently added version record
router.get("/version/latest", getLatestVersion);

// GET /api/public/app-version — registered on app in server.ts (no middleware)

export default router;
