import { Request, Response } from "express";
import {
  getMenuIdForStaff,
  getPendingStaffTableCalls,
  getStaffTableCallSnapshot,
  getStaffTableCallsHistory,
  setStaffTableCallStatus,
  updateStaffTableCallItems,
  updateStaffTableCallItemsAndStatus,
  completeStaffTableCall,
} from "../services/staffTableCall.service";
import { canStaffFinishOrders } from "../config/staffJobRoles";
import { resolveActorForLog } from "../services/menuActivityLog.service";
import { menuOwnerHasCapability } from "../services/planCapabilities.service";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  broadcastStaffTableCallChanged,
  type StaffTableCallChangedPayload,
} from "../socket/staffIoBroadcast";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";

function tableCallSummaries(
  snap: {
    tableNumber?: string;
    customerName?: string | null;
  } | null,
  kind:
    | { type: "status"; status: string }
    | { type: "confirm"; confirmed: boolean }
    | { type: "items" },
): { ar: string; en: string } {
  const tbl = String(snap?.tableNumber ?? "").trim() || "?";
  const cust =
    snap?.customerName != null && String(snap.customerName).trim() !== ""
      ? String(snap.customerName).trim()
      : "";

  if (kind.type === "status") {
    const st = kind.status;
    if (cust) {
      return {
        ar: `طلب ${cust} — طاولة ${tbl} — الحالة: ${st}`,
        en: `${cust} — table ${tbl} — status: ${st}`,
      };
    }
    return {
      ar: `طلب طاولة ${tbl} — الحالة: ${st}`,
      en: `Table ${tbl} — status: ${st}`,
    };
  }

  if (kind.type === "confirm") {
    if (cust) {
      return kind.confirmed
        ? {
            ar: `تأكيد طلب ${cust} — طاولة ${tbl}`,
            en: `Confirmed order — ${cust} — table ${tbl}`,
          }
        : {
            ar: `إلغاء طلب ${cust} — طاولة ${tbl}`,
            en: `Cancelled order — ${cust} — table ${tbl}`,
          };
    }
    return kind.confirmed
      ? {
          ar: `تأكيد طلب طاولة ${tbl}`,
          en: `Confirmed table ${tbl} order`,
        }
      : {
          ar: `إلغاء طلب طاولة ${tbl}`,
          en: `Cancelled table ${tbl} order`,
        };
  }

  if (cust) {
    return {
      ar: `تعديل أصناف طلب ${cust} — طاولة ${tbl}`,
      en: `Edited order lines — ${cust} — table ${tbl}`,
    };
  }
  return {
    ar: `تعديل أصناف طلب طاولة ${tbl}`,
    en: `Edited items — table ${tbl} order`,
  };
}

async function emitCallChanged(
  menuId: number,
  callId: number,
): Promise<void> {
  const snap = await getStaffTableCallSnapshot(menuId, callId);
  if (!snap) return;
  const payload: StaffTableCallChangedPayload = {
    id: snap.id,
    menuId: snap.menuId,
    tableNumber: snap.tableNumber,
    at: snap.createdAt.toISOString(),
    customerName: snap.customerName,
    items: snap.items,
    orderTotal: snap.orderTotal,
    status: snap.status,
    requestKind: snap.requestKind,
  };
  if (snap.lastEditedByStaffId != null) {
    payload.lastEditedByStaffId = snap.lastEditedByStaffId;
  }
  if (snap.lastEditedAt) {
    payload.lastEditedAt = snap.lastEditedAt.toISOString();
  }
  if (snap.lastEditedByName) {
    payload.lastEditedByName = snap.lastEditedByName;
  }
  broadcastStaffTableCallChanged(menuId, payload);
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

    if (!(await menuOwnerHasCapability(menuId, "tableOrderingQr"))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: "tableOrderingQr",
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
        requestKind: c.requestKind,
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

    if (!(await menuOwnerHasCapability(menuId, "tableOrderingQr"))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: "tableOrderingQr",
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
      requestKind: snap.requestKind,
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

    if (!(await menuOwnerHasCapability(menuId, "tableOrderingQr"))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: "tableOrderingQr",
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
        requestKind: c.requestKind,
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
 * Replaces order lines; status transitions only while `pending`. On `confirmed` orders, `pending`/`confirmed` update items only.
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

    if (!(await menuOwnerHasCapability(menuId, "tableOrderingQr"))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: "tableOrderingQr",
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
      if (result.error === "NOT_EDITABLE") {
        sendApiError(res, req, 409, ApiErrors.tableCallNotEditable);
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
    const snapPut = await getStaffTableCallSnapshot(menuId, callId);
    res.json({
      items: result.items,
      orderTotal: result.orderTotal,
      status: result.status,
    });
    const sums = tableCallSummaries(snapPut, {
      type: "status",
      status: result.status,
    });
    void logMenuActivitySafe(req, menuId, {
      action: "TABLE_CALL_UPDATED",
      targetType: "table_call",
      targetId: callId,
      summaryAr: sums.ar,
      summaryEn: sums.en,
      detailJson: JSON.stringify({
        status: result.status,
        order: snapPut
          ? {
              tableNumber: snapPut.tableNumber,
              customerName: snapPut.customerName,
              items: snapPut.items,
              orderTotal: snapPut.orderTotal,
              status: snapPut.status,
            }
          : null,
      }),
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

    if (!(await menuOwnerHasCapability(menuId, "tableOrderingQr"))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: "tableOrderingQr",
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
    const snapStatus = await getStaffTableCallSnapshot(menuId, callId);
    res.json({ status: raw });
    const confirmed = raw === "confirmed";
    const sums = tableCallSummaries(snapStatus, {
      type: "confirm",
      confirmed,
    });
    void logMenuActivitySafe(req, menuId, {
      action: confirmed ? "TABLE_CALL_CONFIRMED" : "TABLE_CALL_CANCELLED",
      targetType: "table_call",
      targetId: callId,
      summaryAr: sums.ar,
      summaryEn: sums.en,
      detailJson: JSON.stringify({
        status: raw,
        order: snapStatus
          ? {
              tableNumber: snapStatus.tableNumber,
              customerName: snapStatus.customerName,
              items: snapStatus.items,
              orderTotal: snapStatus.orderTotal,
              status: snapStatus.status,
            }
          : null,
      }),
    });
  } catch (error) {
    logger.error("patchTableCallStatus error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCallStatusUpdate);
  }
}

/**
 * PATCH /api/staff-auth/table-calls/:id/items — edit quantities / lines (pending or confirmed; each save is logged to MenuActivity)
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

    if (!(await menuOwnerHasCapability(menuId, "tableOrderingQr"))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: "tableOrderingQr",
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
      staffId,
    );

    if (!result.ok) {
      if (result.error === "NOT_FOUND") {
        sendApiError(res, req, 404, ApiErrors.callNotFoundOrNotPending);
        return;
      }
      if (result.error === "NOT_EDITABLE" || result.error === "NOT_PENDING") {
        sendApiError(
          res,
          req,
          409,
          result.error === "NOT_EDITABLE"
            ? ApiErrors.tableCallNotEditable
            : ApiErrors.callNotFoundOrNotPending,
        );
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
    const snapItems = await getStaffTableCallSnapshot(menuId, callId);
    res.json({
      items: result.items,
      orderTotal: result.orderTotal,
      status: result.status,
      lastEditedByStaffId: snapItems?.lastEditedByStaffId ?? null,
      lastEditedAt: snapItems?.lastEditedAt?.toISOString() ?? null,
      lastEditedByName: snapItems?.lastEditedByName ?? null,
    });
    const sums = tableCallSummaries(snapItems, { type: "items" });
    void logMenuActivitySafe(req, menuId, {
      action: "TABLE_CALL_ITEMS_UPDATED",
      targetType: "table_call",
      targetId: callId,
      summaryAr: sums.ar,
      summaryEn: sums.en,
      detailJson: JSON.stringify({
        status: result.status,
        staffId,
        order: snapItems
          ? {
              tableNumber: snapItems.tableNumber,
              customerName: snapItems.customerName,
              items: snapItems.items,
              orderTotal: snapItems.orderTotal,
              status: snapItems.status,
            }
          : null,
      }),
    });
  } catch (error) {
    logger.error("patchTableCallItems error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateCallItems);
  }
}

/**
 * PATCH /api/staff-auth/table-calls/:id/complete — cashier finishes table order.
 */
export async function patchTableCallComplete(
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

    if (!(await menuOwnerHasCapability(menuId, "tableOrderingQr"))) {
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PLAN_CAPABILITY_REQUIRED",
        capability: "tableOrderingQr",
      });
      return;
    }

    const callId = parseInt(req.params.id, 10);
    if (!Number.isFinite(callId) || callId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidCallId);
      return;
    }

    const actor = await resolveActorForLog(req);
    if (!canStaffFinishOrders(actor.staffJobRole, actor.actorRole)) {
      sendApiError(res, req, 403, ApiErrors.staffCashierRequired);
      return;
    }

    const snapBefore = await getStaffTableCallSnapshot(menuId, callId);
    if (!snapBefore) {
      sendApiError(res, req, 404, ApiErrors.tableCallNotFound);
      return;
    }

    const ok = await completeStaffTableCall(callId, menuId);
    if (!ok) {
      sendApiError(res, req, 409, ApiErrors.callNotFoundOrNotPending);
      return;
    }

    await emitCallChanged(menuId, callId);
    const snapAfter = await getStaffTableCallSnapshot(menuId, callId);
    res.json({ status: "delivered" });
    void logMenuActivitySafe(req, menuId, {
      action: "TABLE_CALL_COMPLETED",
      targetType: "table_call",
      targetId: callId,
      summaryAr: tableCallSummaries(snapAfter, {
        type: "status",
        status: "delivered",
      }).ar,
      summaryEn: tableCallSummaries(snapAfter, {
        type: "status",
        status: "delivered",
      }).en,
      detailJson: JSON.stringify({
        status: "delivered",
        order: snapAfter
          ? {
              tableNumber: snapAfter.tableNumber,
              customerName: snapAfter.customerName,
              items: snapAfter.items,
              orderTotal: snapAfter.orderTotal,
              status: snapAfter.status,
            }
          : null,
      }),
    });
  } catch (error) {
    logger.error("patchTableCallComplete error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCallStatusUpdate);
  }
}
