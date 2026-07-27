import { Request, Response } from "express";
import {
  getGuestOpenTableOrder,
  processGuestStaffCall,
  replaceGuestPendingTableOrder,
} from "../services/staffTableCall.service";
import { notifyStaffOfTableCall } from "../services/staffNotify.service";
import { logger } from "../utils/logger";
import { pickLocalized } from "../utils/apiErrorResponse";

function statusForError(error: string): number {
  switch (error) {
    case "MENU_NOT_FOUND":
    case "NOT_FOUND":
      return 404;
    case "FEATURE_REQUIRES_PRO":
      return 403;
    case "NOT_EDITABLE":
      return 409;
    case "INVALID_PAYLOAD":
    case "INVALID_TABLE":
    case "INVALID_ORDER_ITEMS":
    case "INVALID_GOVERNORATE":
    case "INVALID_BRANCH":
    case "DELIVERY_OUT_OF_RANGE":
    case "INVALID_PHONE":
    case "INVALID_ADDRESS":
    case "DELIVERY_DISABLED":
      return 400;
    default:
      return 500;
  }
}

function attachProFeatureErrors(
  req: Request,
  error: string,
  body: Record<string, unknown>,
): void {
  if (error !== "FEATURE_REQUIRES_PRO") return;
  const proAr =
    "نداء الطاقم والطاولات متاح لخطط Pro فقط. راجع صاحب المنيو للترقية.";
  const proEn =
    "Staff call and tables are available on Pro plans only. Ask the owner to upgrade.";
  body.code = "PRO_REQUIRED";
  body.message = pickLocalized(req, { en: proEn, ar: proAr });
  body.errorAr = proAr;
  body.errorEn = proEn;
}

function serializeGuestOpenCall(call: {
  id: number;
  menuId: number;
  tableNumber: string;
  customerName: string | null;
  items: unknown;
  orderTotal: number;
  status: string;
  createdAt: Date;
  requestKind: string;
}) {
  return {
    id: call.id,
    menuId: call.menuId,
    tableNumber: call.tableNumber,
    customerName: call.customerName,
    items: call.items,
    orderTotal: call.orderTotal,
    status: call.status,
    at: call.createdAt.toISOString(),
    requestKind: call.requestKind,
  };
}

/**
 * POST /api/public/staff-call
 * Body: {
 *   menuId: number,
 *   tableNumber: string,
 *   customerName?: string,
 *   items?: Array<
 *     | {
 *         menuItemId: number;
 *         quantity: number;
 *         price?: number;
 *         name?: string;
 *         notes?: string;
 *         size?: { nameAr: string; nameEn: string; price: number } | null;
 *         variant?: { labelAr: string; labelEn: string; price: number } | null;
 *       }
 *     | { name: string; quantity?: number; price?: number; notes?: string }
 *   >
 *   (price optional — filled from MenuItems + size/variant; response includes line totals + orderTotal)
 *   requestKind?: "order" | "waiter" | "bill" — waiter/bill = service ping (no items; table only)
 *   status?: "pending" | "confirmed" | "cancelled" — optional; default pending (confirmed sets acknowledgedAt)
 * }
 */
export async function postGuestStaffCall(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = Number(req.body?.menuId);
    const tableNumber = String(req.body?.tableNumber ?? "").trim();

    const result = await processGuestStaffCall(menuId, tableNumber, {
      customerName: req.body?.customerName,
      customerPhone: req.body?.customerPhone,
      customerAddress: req.body?.customerAddress,
      orderNotes: req.body?.orderNotes,
      type: req.body?.type,
      requestKind: req.body?.requestKind,
      items: req.body?.items,
      status: req.body?.status,
      governorateId: req.body?.governorateId,
      branchId: req.body?.branchId,
      customerLat: req.body?.customerLat,
      customerLng: req.body?.customerLng,
      governorateNameAr: req.body?.governorateNameAr,
      governorateNameEn: req.body?.governorateNameEn,
    });

    if (!result.ok) {
      const status = statusForError(result.error);
      const body: Record<string, unknown> = { ok: false, error: result.error };
      attachProFeatureErrors(req, result.error, body);
      res.status(status).json(body);
      return;
    }

    // Do not block the HTTP response on push/FCM (can hang behind proxies → 502).
    void notifyStaffOfTableCall(result.menuId, {
      id: result.id,
      menuId: result.menuId,
      tableNumber: result.tableNumber,
      at: result.createdAt.toISOString(),
      customerName: result.customerName,
      items: result.items,
      orderTotal: result.orderTotal,
      status: result.status,
      requestKind: result.requestKind,
    }).catch((err) => {
      logger.warn("notifyStaffOfTableCall failed after staff-call", {
        menuId: result.menuId,
        callId: result.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    res.json({
      ok: true,
      id: result.id,
      menuId: result.menuId,
      tableNumber: result.tableNumber,
      at: result.createdAt.toISOString(),
      customerName: result.customerName,
      items: result.items,
      orderTotal: result.orderTotal,
      status: result.status,
      requestKind: result.requestKind,
    });
  } catch (error) {
    logger.error("postGuestStaffCall error:", error);
    const srvEn = "A server error occurred. Please try again.";
    const srvAr = "حدث خطأ في الخادم. حاول مرة أخرى.";
    res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: pickLocalized(req, { en: srvEn, ar: srvAr }),
      errorAr: srvAr,
      errorEn: srvEn,
    });
  }
}

/**
 * GET /api/public/staff-call/open?menuId=&tableNumber=
 * Returns the open table order for the guest View, or call: null.
 */
export async function getGuestOpenStaffCall(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = Number(req.query?.menuId);
    const tableNumber = String(req.query?.tableNumber ?? "").trim();
    const result = await getGuestOpenTableOrder(menuId, tableNumber);

    if (!result.ok) {
      const status = statusForError(result.error);
      const body: Record<string, unknown> = { ok: false, error: result.error };
      attachProFeatureErrors(req, result.error, body);
      res.status(status).json(body);
      return;
    }

    res.json({
      ok: true,
      call: result.call ? serializeGuestOpenCall(result.call) : null,
    });
  } catch (error) {
    logger.error("getGuestOpenStaffCall error:", error);
    const srvEn = "A server error occurred. Please try again.";
    const srvAr = "حدث خطأ في الخادم. حاول مرة أخرى.";
    res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: pickLocalized(req, { en: srvEn, ar: srvAr }),
      errorAr: srvAr,
      errorEn: srvEn,
    });
  }
}

/**
 * PATCH /api/public/staff-call/open
 * Guest replaces pending open-table items. Empty items cancels the pending order.
 */
export async function patchGuestOpenStaffCall(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = Number(req.body?.menuId);
    const tableNumber = String(req.body?.tableNumber ?? "").trim();
    const result = await replaceGuestPendingTableOrder(
      menuId,
      tableNumber,
      req.body?.items,
    );

    if (!result.ok) {
      const status = statusForError(result.error);
      const body: Record<string, unknown> = { ok: false, error: result.error };
      attachProFeatureErrors(req, result.error, body);
      res.status(status).json(body);
      return;
    }

    res.json({
      ok: true,
      cancelled: result.cancelled,
      call: result.call ? serializeGuestOpenCall(result.call) : null,
    });
  } catch (error) {
    logger.error("patchGuestOpenStaffCall error:", error);
    const srvEn = "A server error occurred. Please try again.";
    const srvAr = "حدث خطأ في الخادم. حاول مرة أخرى.";
    res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: pickLocalized(req, { en: srvEn, ar: srvAr }),
      errorAr: srvAr,
      errorEn: srvEn,
    });
  }
}
