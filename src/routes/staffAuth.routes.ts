import { Router } from "express";
import { body, param, query } from "express-validator";
import * as staffAuthController from "../controllers/staffAuth.controller";
import * as staffTableCallController from "../controllers/staffTableCall.controller";
import { validate } from "../middleware/validation";
import { requireAuth, requireStaff } from "../middleware/auth.middleware";
import { requireStaffPermission } from "../middleware/requireStaffPermission";

const router = Router();

// POST /api/staff-auth/login
router.post(
  "/login",
  validate([
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty().isLength({ min: 6 }),
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
  requireStaffPermission("orders:view"),
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
  requireStaffPermission("orders:view"),
  staffTableCallController.listPendingStaffTableCalls,
);

// GET /api/staff-auth/table-calls/:id — single order (same shape as history item)
router.get(
  "/table-calls/:id",
  requireStaff,
  requireStaffPermission("orders:view"),
  validate([param("id").isInt()]),
  staffTableCallController.getStaffTableCallById,
);

// PUT /api/staff-auth/table-calls/:id — body: { items, status } — replace lines + status in one request
// Base gate is orders:edit_items; a status change also requires confirm/cancel (checked in controller).
router.put(
  "/table-calls/:id",
  requireStaff,
  requireStaffPermission("orders:edit_items"),
  validate([param("id").isInt()]),
  staffTableCallController.putStaffTableCall,
);

// PATCH /api/staff-auth/table-calls/:id/status — body: { status: "confirmed" | "cancelled" }
// Coarse gate here; the exact confirm vs cancel permission is enforced in the controller.
router.patch(
  "/table-calls/:id/status",
  requireStaff,
  requireStaffPermission.any(["orders:confirm", "orders:cancel"]),
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
  requireStaffPermission("orders:edit_items"),
  validate([param("id").isInt()]),
  staffTableCallController.patchTableCallItems,
);

// PATCH /api/staff-auth/table-calls/:id/prepare — mark confirmed order as prepared (food preparer)
router.patch(
  "/table-calls/:id/prepare",
  requireStaff,
  requireStaffPermission("orders:prepare"),
  validate([param("id").isInt()]),
  staffTableCallController.patchTableCallPrepare,
);

// PATCH /api/staff-auth/table-calls/:id/complete — finish table order
router.patch(
  "/table-calls/:id/complete",
  requireStaff,
  requireStaffPermission("orders:complete"),
  validate([param("id").isInt()]),
  staffTableCallController.patchTableCallComplete,
);

// POST /api/staff-auth/logout
router.post("/logout", requireAuth, staffAuthController.staffLogout);

export default router;
