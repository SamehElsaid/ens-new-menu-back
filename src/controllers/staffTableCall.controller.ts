import { Request, Response } from "express";
import {
  getMenuIdForStaff,
  getPendingStaffTableCalls,
  getStaffTableCallSnapshot,
  getStaffTableCallsHistory,
  setStaffTableCallStatus,
  updateStaffTableCallItems,
  updateStaffTableCallItemsAndStatus,
} from "../services/staffTableCall.service";
import { menuOwnerHasProPlan } from "../services/subscriptionPlan.service";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { broadcastStaffTableCallChanged } from "../socket/staffIoBroadcast";

async function emitCallChanged(
  menuId: number,
  callId: number,
): Promise<void> {
  const snap = await getStaffTableCallSnapshot(menuId, callId);
  if (!snap) return;
  broadcastStaffTableCallChanged(menuId, {
    id: snap.id,
    menuId: snap.menuId,
    tableNumber: snap.tableNumber,
    at: snap.createdAt.toISOString(),
    customerName: snap.customerName,
    items: snap.items,
    orderTotal: snap.orderTotal,
    status: snap.status,
  });
}

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
        confirmedAt: c.acknowledgedAt
          ? c.acknowledgedAt.toISOString()
          : null,
        customerName: c.customerName,
        orderTotal: c.orderTotal,
        status: c.status,
      })),
    });
  } catch (error) {
    logger.error("listStaffTableCallsHistory error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListTableCallsHistory);
  }
}

/**
 * GET /api/staff-auth/table-calls/:id — single call (same fields as history rows)
 */
export async function getStaffTableCallById(
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

    const callId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(callId) || callId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidCallId);
      return;
    }

    const snap = await getStaffTableCallSnapshot(menuId, callId);
    if (!snap) {
      sendApiError(res, req, 404, ApiErrors.tableCallNotFound);
      return;
    }

    const acknowledgedAt = snap.acknowledgedAt ?? null;
    res.json({
      id: snap.id,
      menuId: snap.menuId,
      tableNumber: snap.tableNumber,
      requestedAt: snap.createdAt.toISOString(),
      confirmedAt: acknowledgedAt ? acknowledgedAt.toISOString() : null,
      customerName: snap.customerName,
      items: snap.items,
      orderTotal: snap.orderTotal,
      status: snap.status,
    });
  } catch (error) {
    logger.error("getStaffTableCallById error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetTableCall);
  }
}

/**
 * GET /api/staff-auth/table-calls — pending calls for logged-in staff's menu
 */
export async function listPendingStaffTableCalls(
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
        orderTotal: c.orderTotal,
        status: c.status,
      })),
    });
  } catch (error) {
    logger.error("listPendingStaffTableCalls error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListTableCalls);
  }
}

/**
 * PUT /api/staff-auth/table-calls/:id
 * Body: { items: [{ menuItemId, quantity }, ...], status: "pending" | "confirmed" | "cancelled" }
 * Replaces stored order lines with `items` and applies `status` in one step (only while `pending`).
 */
export async function putStaffTableCall(
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

    const callId = parseInt(req.params.id, 10);
    if (!Number.isFinite(callId) || callId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidCallId);
      return;
    }

    const rawStatus = String(req.body?.status ?? "")
      .trim()
      .toLowerCase();
    if (
      rawStatus !== "pending" &&
      rawStatus !== "confirmed" &&
      rawStatus !== "cancelled"
    ) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const result = await updateStaffTableCallItemsAndStatus(
      callId,
      menuId,
      req.body?.items,
      rawStatus as "pending" | "confirmed" | "cancelled",
    );

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        sendApiError(res, req, 404, ApiErrors.callNotFoundOrNotPending);
        return;
      }
      if (result.error === "NOT_PENDING") {
        sendApiError(res, req, 409, ApiErrors.callNotFoundOrNotPending);
        return;
      }
      if (
        result.error === "INVALID_PAYLOAD" ||
        result.error === "INVALID_ORDER_ITEMS"
      ) {
        sendApiError(res, req, 400, ApiErrors.validationFailed);
        return;
      }
      sendApiError(res, req, 500, ApiErrors.failedUpdateCallItems);
      return;
    }

    await emitCallChanged(menuId, callId);
    res.json({
      items: result.items,
      orderTotal: result.orderTotal,
      status: result.status,
    });
  } catch (error) {
    logger.error("putStaffTableCall error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateCallItems);
  }
}

/**
 * PATCH /api/staff-auth/table-calls/:id/status
 * Body: { "status": "confirmed" | "cancelled" } — only from `pending`.
 */
export async function patchTableCallStatus(
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

    const callId = parseInt(req.params.id, 10);
    if (!Number.isFinite(callId) || callId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidCallId);
      return;
    }

    const raw = String(req.body?.status ?? "")
      .trim()
      .toLowerCase();
    if (raw !== "confirmed" && raw !== "cancelled") {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const ok = await setStaffTableCallStatus(
      callId,
      menuId,
      raw as "confirmed" | "cancelled",
    );
    if (!ok) {
      sendApiError(res, req, 404, ApiErrors.callNotFoundOrNotPending);
      return;
    }

    await emitCallChanged(menuId, callId);
    res.json({ status: raw });
  } catch (error) {
    logger.error("patchTableCallStatus error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCallStatusUpdate);
  }
}

/**
 * PATCH /api/staff-auth/table-calls/:id/items — edit quantities / lines while pending
 * Body: { items: same shape as guest staff-call }
 */
export async function patchTableCallItems(
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

    const callId = parseInt(req.params.id, 10);
    if (!Number.isFinite(callId) || callId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidCallId);
      return;
    }

    const result = await updateStaffTableCallItems(
      callId,
      menuId,
      req.body?.items,
    );

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        sendApiError(res, req, 404, ApiErrors.callNotFoundOrNotPending);
        return;
      }
      if (result.error === "NOT_PENDING") {
        sendApiError(res, req, 409, ApiErrors.callNotFoundOrNotPending);
        return;
      }
      if (
        result.error === "INVALID_PAYLOAD" ||
        result.error === "INVALID_ORDER_ITEMS"
      ) {
        sendApiError(res, req, 400, ApiErrors.validationFailed);
        return;
      }
      sendApiError(res, req, 500, ApiErrors.failedUpdateCallItems);
      return;
    }

    await emitCallChanged(menuId, callId);
    res.json({
      items: result.items,
      orderTotal: result.orderTotal,
      status: "pending" as const,
    });
  } catch (error) {
    logger.error("patchTableCallItems error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateCallItems);
  }
}
