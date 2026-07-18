import { Request, Response } from "express";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../services/notificationService";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

function getUserId(req: Request): number | undefined {
  return req.user?.userId ?? req.user?.id;
}

export async function getNotifications(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === "string" && Number.isFinite(Number(limitRaw))
        ? Math.min(50, Math.max(1, Math.floor(Number(limitRaw))))
        : 30;

    const [notifications, unreadCount] = await Promise.all([
      getUserNotifications(userId, limit),
      getUnreadCount(userId),
    ]);

    res.json({ notifications, unreadCount });
  } catch (error) {
    logger.error("Get notifications error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetNotifications);
  }
}

export async function markNotificationRead(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const notificationId = Number(req.params.id);
    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidNotificationId);
      return;
    }

    const ok = await markAsRead(notificationId, userId);
    if (!ok) {
      sendApiError(res, req, 500, ApiErrors.failedMarkNotificationRead);
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Mark notification read error:", error);
    sendApiError(res, req, 500, ApiErrors.failedMarkNotificationRead);
  }
}

export async function markAllNotificationsRead(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const ok = await markAllAsRead(userId);
    if (!ok) {
      sendApiError(res, req, 500, ApiErrors.failedMarkAllNotificationsRead);
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Mark all notifications read error:", error);
    sendApiError(res, req, 500, ApiErrors.failedMarkAllNotificationsRead);
  }
}

export async function removeNotification(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const notificationId = Number(req.params.id);
    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      sendApiError(res, req, 400, ApiErrors.invalidNotificationId);
      return;
    }

    const ok = await deleteNotification(notificationId, userId);
    if (!ok) {
      sendApiError(res, req, 500, ApiErrors.failedDeleteNotification);
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Delete notification error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteNotification);
  }
}
