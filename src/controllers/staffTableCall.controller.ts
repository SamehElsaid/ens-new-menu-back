import { Request, Response } from "express";
import {
  acknowledgeStaffTableCall,
  getMenuIdForStaff,
  getPendingStaffTableCalls,
} from "../services/staffTableCall.service";
import { logger } from "../utils/logger";

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
