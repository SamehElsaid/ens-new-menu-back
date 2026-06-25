import { Request, Response } from "express";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";
import {
  isBroadcastAudience,
  type BroadcastAudience,
} from "../utils/adminUserFilters";
import {
  previewBroadcastRecipients,
  sendBroadcastEmail,
} from "../services/adminBroadcastEmail.service";

function parseAudience(value: unknown): BroadcastAudience | null {
  const raw = String(value ?? "").trim();
  return isBroadcastAudience(raw) ? raw : null;
}

function parseUserIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((id) => Number(id)).filter((id) => id > 0))];
  }
  if (typeof value === "string" && value.trim()) {
    return [
      ...new Set(
        value
          .split(",")
          .map((id) => Number(id.trim()))
          .filter((id) => id > 0),
      ),
    ];
  }
  return [];
}

export async function getBroadcastPreview(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const audience = parseAudience(req.query.audience);
    if (!audience) {
      sendApiError(res, req, 400, ApiErrors.invalidBroadcastAudience);
      return;
    }

    const userIds = parseUserIds(req.query.userIds);
    if (audience === "selected" && userIds.length === 0) {
      sendApiError(res, req, 400, ApiErrors.broadcastRecipientsRequired);
      return;
    }

    const preview = await previewBroadcastRecipients({ audience, userIds });
    res.json(preview);
  } catch (error) {
    logger.error("Broadcast preview error:", error);
    sendApiError(res, req, 500, ApiErrors.failedBroadcastPreview);
  }
}

export async function postBroadcastSend(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const audience = parseAudience(req.body?.audience);
    const subject = String(req.body?.subject ?? "").trim();
    const message = String(req.body?.message ?? "").trim();
    const locale = req.body?.locale === "en" ? "en" : "ar";
    const userIds = parseUserIds(req.body?.userIds);

    if (!audience) {
      sendApiError(res, req, 400, ApiErrors.invalidBroadcastAudience);
      return;
    }

    if (!subject || subject.length < 2) {
      sendApiError(res, req, 400, ApiErrors.broadcastSubjectRequired);
      return;
    }

    if (!message || message.length < 5) {
      sendApiError(res, req, 400, ApiErrors.broadcastMessageRequired);
      return;
    }

    if (audience === "selected" && userIds.length === 0) {
      sendApiError(res, req, 400, ApiErrors.broadcastRecipientsRequired);
      return;
    }

    const result = await sendBroadcastEmail({
      audience,
      userIds,
      subject,
      message,
      locale,
    });

    if (result.total === 0) {
      sendApiError(res, req, 404, ApiErrors.broadcastNoRecipients);
      return;
    }

    res.json({
      message: "Broadcast completed",
      ...result,
    });
  } catch (error) {
    logger.error("Broadcast send error:", error);
    sendApiError(res, req, 500, ApiErrors.failedBroadcastSend);
  }
}
