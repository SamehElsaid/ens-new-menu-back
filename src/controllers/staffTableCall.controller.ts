import { Request, Response } from "express";
import {
  acknowledgeStaffTableCall,
  getMenuIdForStaff,
  getPendingStaffTableCalls,
  getStaffTableCallsHistory,
} from "../services/staffTableCall.service";
import { menuOwnerHasProPlan } from "../services/subscriptionPlan.service";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

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
      sendApiError(res, req, 403, ApiErrors.staffMenuNotFound);
      return;
    }

    if (!(await menuOwnerHasProPlan(menuId))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PRO_REQUIRED",
      });
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
        customerName: c.customerName,
        items: c.items,
      })),
    });
  } catch (error) {
    logger.error("listStaffTableCallsHistory error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListTableCallsHistory);
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
      sendApiError(res, req, 403, ApiErrors.staffMenuNotFound);
      return;
    }

    if (!(await menuOwnerHasProPlan(menuId))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PRO_REQUIRED",
      });
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
        customerName: c.customerName,
        items: c.items,
      })),
    });
  } catch (error) {
    logger.error("listPendingStaffTableCalls error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListTableCalls);
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
      sendApiError(res, req, 403, ApiErrors.staffMenuNotFound);
      return;
    }

    if (!(await menuOwnerHasProPlan(menuId))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PRO_REQUIRED",
      });
      return;
    }

    const callId = parseInt(req.params.id, 10);
    if (!Number.isFinite(callId) || callId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidCallId);
      return;
    }

    const ok = await acknowledgeStaffTableCall(callId, menuId);
    if (!ok) {
      sendApiError(res, req, 404, ApiErrors.callNotFoundOrAcknowledged);
      return;
    }

    res.json({ message: "Acknowledged" });
  } catch (error) {
    logger.error("acknowledgeTableCall error:", error);
    sendApiError(res, req, 500, ApiErrors.failedAcknowledgeCall);
  }
}
