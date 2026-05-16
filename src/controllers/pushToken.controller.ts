/**
 * Firebase Cloud Messaging device tokens for the authenticated app user (`Users.fcmToken` JSON array).
 */

import { Request, Response } from "express";
import {
  addUserFcmToken,
  getUserFcmTokens,
  MAX_FCM_TOKEN_LEN,
} from "../services/fcmPush.service";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

function getUserId(req: Request): number | undefined {
  return req.user?.userId ?? req.user?.id;
}

/** Whether the user has at least one stored FCM token (tokens never returned). */
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

    const tokens = await getUserFcmTokens(userId);
    res.json({ hasFcmToken: tokens.length > 0 });
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

    const result = await addUserFcmToken(userId, token);
    if (result === "max") {
      sendApiError(res, req, 400, ApiErrors.fcmTooManyDevices);
      return;
    }
    if (result === "error") {
      sendApiError(res, req, 500, ApiErrors.failedSaveFcmToken);
      return;
    }
    res.json({ message: "FCM token saved" });
  } catch (error) {
    logger.error("Register FCM token error:", error);
    sendApiError(res, req, 500, ApiErrors.failedSaveFcmToken);
  }
}
