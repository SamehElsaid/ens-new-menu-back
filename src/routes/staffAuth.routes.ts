import { Router } from "express";
import { body, param, query } from "express-validator";
import * as staffAuthController from "../controllers/staffAuth.controller";
import * as staffTableCallController from "../controllers/staffTableCall.controller";
import { validate } from "../middleware/validation";
import { requireAuth, requireStaff } from "../middleware/auth.middleware";
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
  staffAuthController.staffLogin,
);

// GET /api/staff-auth/me
router.get("/me", requireAuth, staffAuthController.getStaffMe);

// GET /api/staff-auth/table-calls/history — all calls (table + requestedAt + acknowledgedAt)
router.get(
  "/table-calls/history",
  requireStaff,
  validate([
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 500 }).toInt(),
  ]),
  staffTableCallController.listStaffTableCallsHistory,
);

// GET /api/staff-auth/table-calls — pending persisted calls (staff only)
router.get(
  "/table-calls",
  requireStaff,
  staffTableCallController.listPendingStaffTableCalls,
);

// PATCH /api/staff-auth/table-calls/:id/acknowledge
router.patch(
  "/table-calls/:id/acknowledge",
  requireStaff,
  validate([param("id").isInt()]),
  staffTableCallController.acknowledgeTableCall,
);

// POST /api/staff-auth/logout
router.post("/logout", requireAuth, staffAuthController.staffLogout);

export default router;
