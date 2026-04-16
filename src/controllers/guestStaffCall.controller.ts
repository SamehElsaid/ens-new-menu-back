import { Request, Response } from "express";
import { processGuestStaffCall } from "../services/staffTableCall.service";
import { broadcastStaffTableCall } from "../socket/staffIoBroadcast";
import { logger } from "../utils/logger";
import { pickLocalized } from "../utils/apiErrorResponse";

function statusForError(error: string): number {
  switch (error) {
    case "MENU_NOT_FOUND":
      return 404;
    case "FEATURE_REQUIRES_PRO":
      return 403;
    case "INVALID_PAYLOAD":
    case "INVALID_TABLE":
    case "INVALID_ORDER_ITEMS":
      return 400;
    default:
      return 500;
  }
}

/**
 * POST /api/public/staff-call
 * Body: {
 *   menuId: number,
 *   tableNumber: string,
 *   customerName?: string,
 *   items?: Array<
 *     | { menuItemId: number; price: number; quantity: number; name?: string; notes?: string }
 *     | { name: string; quantity?: number; price?: number; notes?: string }
 *   >
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
      items: req.body?.items,
    });

    if (!result.ok) {
      const status = statusForError(result.error);
      const proAr =
        "نداء الطاقم والطاولات متاح لخطط Pro فقط. راجع صاحب المنيو للترقية.";
      const proEn =
        "Staff call and tables are available on Pro plans only. Ask the owner to upgrade.";
      const body: Record<string, unknown> = { ok: false, error: result.error };
      if (result.error === "FEATURE_REQUIRES_PRO") {
        body.code = "PRO_REQUIRED";
        body.message = pickLocalized(req, { en: proEn, ar: proAr });
        body.errorAr = proAr;
        body.errorEn = proEn;
      }
      res.status(status).json(body);
      return;
    }

    broadcastStaffTableCall(result.menuId, {
      id: result.id,
      menuId: result.menuId,
      tableNumber: result.tableNumber,
      at: result.createdAt.toISOString(),
      customerName: result.customerName,
      items: result.items,
    });

    res.json({
      ok: true,
      id: result.id,
      menuId: result.menuId,
      tableNumber: result.tableNumber,
      at: result.createdAt.toISOString(),
      customerName: result.customerName,
      items: result.items,
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
