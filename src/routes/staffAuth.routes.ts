import { Router } from "express";
import { body, param, query } from "express-validator";
import * as staffAuthController from "../controllers/staffAuth.controller";
import * as staffTableCallController from "../controllers/staffTableCall.controller";
import { validate } from "../middleware/validation";
import { requireAuth, requireStaff } from "../middleware/auth.middleware";

const router = Router();

// POST /api/staff-auth/login
router.post(
  "/login",
  validate([
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty().isLength({ min: 6 }),
    body("menuSlug").notEmpty().trim().isLength({ max: 200 }),
    body("expoToken").optional({ nullable: true }).isString().trim()
      .isLength({ max: 256 }),
  ]),
  staffAuthController.staffLogin,
);

// GET /api/staff-auth/me
router.get("/me", requireAuth, staffAuthController.getStaffMe);

// GET /api/staff-auth/table-calls/history — all calls (requestedAt, confirmedAt, status)
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

// GET /api/staff-auth/table-calls/:id — single order (same shape as history item)
router.get(
  "/table-calls/:id",
  requireStaff,
  validate([param("id").isInt()]),
  staffTableCallController.getStaffTableCallById,
);

// PUT /api/staff-auth/table-calls/:id — body: { items, status } — replace lines + status in one request
router.put(
  "/table-calls/:id",
  requireStaff,
  validate([param("id").isInt()]),
  staffTableCallController.putStaffTableCall,
);

// PATCH /api/staff-auth/table-calls/:id/status — body: { status: "confirmed" | "cancelled" }
router.patch(
  "/table-calls/:id/status",
  requireStaff,
  validate([
    param("id").isInt(),
    body("status").isIn(["confirmed", "cancelled"]),
  ]),
  staffTableCallController.patchTableCallStatus,
);

// PATCH /api/staff-auth/table-calls/:id/items — edit cart lines (pending or confirmed; not cancelled)
router.patch(
  "/table-calls/:id/items",
  requireStaff,
  validate([param("id").isInt()]),
  staffTableCallController.patchTableCallItems,
);

// POST /api/staff-auth/logout
router.post("/logout", requireAuth, staffAuthController.staffLogout);

export default router;
