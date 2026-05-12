/**
 * Firebase Cloud Messaging device token for the authenticated app user (`Users.fcmToken`).
 */

import { Request, Response } from "express";
import {
  getUserFcmToken,
  MAX_FCM_TOKEN_LEN,
  saveUserFcmToken,
} from "../services/fcmPush.service";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

function getUserId(req: Request): number | undefined {
  return req.user?.userId ?? req.user?.id;
}

/** Whether `Users.fcmToken` has a non-empty value (token string never returned). */
export async function getFcmTokenStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const token = await getUserFcmToken(userId);
    res.json({ hasFcmToken: Boolean(token) });
  } catch (error) {
    logger.error("Get FCM token status error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}

/** Body: `{ "fcmToken": "..." }` → updates `Users.fcmToken`. */
export async function registerFcmToken(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const raw = (req.body as { fcmToken?: unknown }).fcmToken;
    if (typeof raw !== "string" || !raw.trim()) {
      sendApiError(res, req, 400, ApiErrors.fcmTokenRequired);
      return;
    }
    const token = raw.trim();
    if (token.length > MAX_FCM_TOKEN_LEN) {
      sendApiError(res, req, 400, ApiErrors.invalidFcmTokenLength);
      return;
    }

    const ok = await saveUserFcmToken(userId, token);
    if (ok) {
      res.json({ message: "FCM token saved" });
    } else {
      sendApiError(res, req, 500, ApiErrors.failedSaveFcmToken);
    }
  } catch (error) {
    logger.error("Register FCM token error:", error);
    sendApiError(res, req, 500, ApiErrors.failedSaveFcmToken);
  }
}
