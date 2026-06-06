import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createMenuAd,
  getMenuAds,
  updateAd,
  deleteAd,
  toggleAdStatus,
} from "../controllers/ads.controller";
import { resolveMenuParam } from "../middleware/resolveMenuIdentifier.middleware";

const router = Router();

router.param("menuId", resolveMenuParam);

// All routes require authentication
router.use(requireAuth);

// Menu ads routes
router.post("/menus/:menuId/ads", createMenuAd);
router.get("/menus/:menuId/ads", getMenuAds);

// Individual ad routes
router.put("/ads/:adId", updateAd);
router.delete("/ads/:adId", deleteAd);
router.patch("/ads/:adId/toggle", toggleAdStatus);

export default router;

