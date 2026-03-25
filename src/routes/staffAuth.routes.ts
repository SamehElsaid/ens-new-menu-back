import { Router } from "express";
import { body } from "express-validator";
import * as staffAuthController from "../controllers/staffAuth.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/staff-auth/login
router.post(
  "/login",
  authLimiter,
  validate([
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty().isLength({ min: 6 }),
    body("menuSlug").notEmpty().trim().isLength({ max: 200 }),
  ]),
  staffAuthController.staffLogin
);

// GET /api/staff-auth/me
router.get("/me", requireAuth, staffAuthController.getStaffMe);

// POST /api/staff-auth/logout
router.post("/logout", requireAuth, staffAuthController.staffLogout);

export default router;
