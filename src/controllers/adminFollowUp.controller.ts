import { Request, Response } from "express";
import {
  buildFollowUpQueue,
  buildFollowUpReport,
  createFollowUpCall,
  listFollowUpCalls,
  type FollowUpSegment,
} from "../services/adminFollowUp.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { logger } from "../utils/logger";

const SEGMENTS = new Set<string>([
  "all",
  "new",
  "no-menu",
  "expiring",
  "inactive",
  "overdue",
  "free",
  "pro",
]);

export async function getFollowUpQueue(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const raw = String(req.query.segment ?? "all");
    const segment = (
      SEGMENTS.has(raw) ? raw : "all"
    ) as FollowUpSegment;
    const data = await buildFollowUpQueue(segment);
    res.json(data);
  } catch (error) {
    logger.error("Get follow-up queue error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load follow-up queue",
      ar: "فشل تحميل قائمة المتابعة",
    });
  }
}

export async function getFollowUpCalls(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.query.userId
      ? Number(req.query.userId)
      : undefined;
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const data = await listFollowUpCalls({ userId, from, to });
    res.json(data);
  } catch (error) {
    logger.error("Get follow-up calls error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load calls",
      ar: "فشل تحميل سجل المكالمات",
    });
  }
}

export async function postFollowUpCall(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { userId, outcome, purpose, notes, nextFollowUpAt, agentName } =
      req.body ?? {};

    if (!userId || !outcome) {
      sendApiError(res, req, 400, {
        en: "userId and outcome are required",
        ar: "معرّف المستخدم ونتيجة المكالمة مطلوبان",
      });
      return;
    }

    const data = await createFollowUpCall(
      {
        userId: Number(userId),
        outcome: String(outcome),
        purpose: purpose ? String(purpose) : undefined,
        notes: notes ? String(notes) : undefined,
        nextFollowUpAt: nextFollowUpAt ?? null,
        agentName: agentName ? String(agentName) : undefined,
      },
      req.user?.userId,
    );

    res.status(201).json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "User not found") {
      sendApiError(res, req, 404, {
        en: "User not found",
        ar: "المستخدم غير موجود",
      });
      return;
    }
    if (msg === "Invalid outcome" || msg === "Invalid purpose") {
      sendApiError(res, req, 400, {
        en: msg,
        ar: "بيانات المكالمة غير صالحة",
      });
      return;
    }
    logger.error("Post follow-up call error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to save call",
      ar: "فشل حفظ المكالمة",
    });
  }
}

export async function getFollowUpReport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const period = String(req.query.period ?? "7d") === "30d" ? "30d" : "7d";
    const data = await buildFollowUpReport(period);
    res.json(data);
  } catch (error) {
    logger.error("Get follow-up report error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load follow-up report",
      ar: "فشل تحميل تقرير المتابعة",
    });
  }
}
