import { Request, Response } from "express";
import {
  acknowledgeStaffTableCall,
  getMenuIdForStaff,
  getPendingStaffTableCalls,
  getStaffTableCallsHistory,
} from "../services/staffTableCall.service";
import { menuOwnerHasProPlan } from "../services/subscriptionPlan.service";
import { logger } from "../utils/logger";

const proRequired = (): {
  status: 403;
  body: Record<string, string>;
} => ({
  status: 403,
  body: {
    code: "PRO_REQUIRED",
    error: "This feature requires a Pro plan.",
    errorAr: "هذه الميزة تتطلب خطة Pro.",
  },
});

/**
 * GET /api/staff-auth/table-calls/history — all calls for menu (table + times), newest first
 */
export async function listStaffTableCallsHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const staffId = req.user!.userId;
    const menuId = await getMenuIdForStaff(staffId);
    if (menuId === null) {
      res.status(403).json({ error: "Staff menu not found" });
      return;
    }

    if (!(await menuOwnerHasProPlan(menuId))) {
      const r = proRequired();
      res.status(r.status).json(r.body);
      return;
    }

    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
    const history = await getStaffTableCallsHistory(menuId, page, limit);

    res.json({
      total: history.total,
      page: history.page,
      limit: history.limit,
      totalPages: Math.ceil(history.total / history.limit),
      calls: history.rows.map((c) => ({
        id: c.id,
        menuId: c.menuId,
        tableNumber: c.tableNumber,
        requestedAt: c.createdAt.toISOString(),
        acknowledgedAt: c.acknowledgedAt
          ? c.acknowledgedAt.toISOString()
          : null,
      })),
    });
  } catch (error) {
    logger.error("listStaffTableCallsHistory error:", error);
    res.status(500).json({ error: "Failed to list table calls history" });
  }
}

/**
 * GET /api/staff-auth/table-calls — pending calls for logged-in staff's menu
 */
export async function listPendingStaffTableCalls(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const staffId = req.user!.userId;
    const menuId = await getMenuIdForStaff(staffId);
    if (menuId === null) {
      res.status(403).json({ error: "Staff menu not found" });
      return;
    }

    if (!(await menuOwnerHasProPlan(menuId))) {
      const r = proRequired();
      res.status(r.status).json(r.body);
      return;
    }

    const limit = parseInt(String(req.query.limit ?? "100"), 10) || 100;
    const rows = await getPendingStaffTableCalls(menuId, limit);

    res.json({
      calls: rows.map((c) => ({
        id: c.id,
        menuId: c.menuId,
        tableNumber: c.tableNumber,
        at: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("listPendingStaffTableCalls error:", error);
    res.status(500).json({ error: "Failed to list table calls" });
  }
}

/**
 * PATCH /api/staff-auth/table-calls/:id/acknowledge
 */
export async function acknowledgeTableCall(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const staffId = req.user!.userId;
    const menuId = await getMenuIdForStaff(staffId);
    if (menuId === null) {
      res.status(403).json({ error: "Staff menu not found" });
      return;
    }

    if (!(await menuOwnerHasProPlan(menuId))) {
      const r = proRequired();
      res.status(r.status).json(r.body);
      return;
    }

    const callId = parseInt(req.params.id, 10);
    if (!Number.isFinite(callId) || callId <= 0) {
      res.status(400).json({ error: "Invalid call id" });
      return;
    }

    const ok = await acknowledgeStaffTableCall(callId, menuId);
    if (!ok) {
      res.status(404).json({
        error: "Call not found, wrong menu, or already acknowledged",
      });
      return;
    }

    res.json({ message: "Acknowledged" });
  } catch (error) {
    logger.error("acknowledgeTableCall error:", error);
    res.status(500).json({ error: "Failed to acknowledge call" });
  }
}
