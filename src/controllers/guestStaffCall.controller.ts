import { Request, Response } from "express";
import { processGuestStaffCall } from "../services/staffTableCall.service";
import { broadcastStaffTableCall } from "../socket/staffIoBroadcast";
import { logger } from "../utils/logger";

function statusForError(error: string): number {
  switch (error) {
    case "MENU_NOT_FOUND":
      return 404;
    case "FEATURE_REQUIRES_PRO":
      return 403;
    case "INVALID_PAYLOAD":
    case "INVALID_TABLE":
      return 400;
    default:
      return 500;
  }
}

/**
 * POST /api/public/staff-call
 * Body: { menuId: number, tableNumber: string }
 */
export async function postGuestStaffCall(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = Number(req.body?.menuId);
    const tableNumber = String(req.body?.tableNumber ?? "").trim();

    const result = await processGuestStaffCall(menuId, tableNumber);

    if (!result.ok) {
      const status = statusForError(result.error);
      const body: Record<string, unknown> = { ok: false, error: result.error };
      if (result.error === "FEATURE_REQUIRES_PRO") {
        body.code = "PRO_REQUIRED";
        body.errorAr =
          "نداء الطاقم والطاولات متاح لخطط Pro فقط. راجع صاحب المنيو للترقية.";
      }
      res.status(status).json(body);
      return;
    }

    broadcastStaffTableCall(result.menuId, {
      id: result.id,
      menuId: result.menuId,
      tableNumber: result.tableNumber,
      at: result.createdAt.toISOString(),
    });

    res.json({
      ok: true,
      id: result.id,
      menuId: result.menuId,
      tableNumber: result.tableNumber,
      at: result.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error("postGuestStaffCall error:", error);
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
