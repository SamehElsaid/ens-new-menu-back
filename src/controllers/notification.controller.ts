/**
 * Notification Controller
 * Handles notification-related HTTP requests
 */

import { Request, Response } from 'express';
import * as notificationService from '../services/notificationService';
import { logger } from '../utils/logger';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';

/**
 * Get all notifications for the authenticated user
 */
export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const notifications = await notificationService.getUserNotifications(userId, limit);

    res.json({ notifications });
  } catch (error) {
    logger.error('Get notifications error:', error);
    sendApiError(res, req, 500, ApiErrors.failedGetNotifications);
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const count = await notificationService.getUnreadCount(userId);

    res.json({ count });
  } catch (error) {
    logger.error('Get unread count error:', error);
    sendApiError(res, req, 500, ApiErrors.failedGetUnreadCount);
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const notificationId = parseInt(id);
    if (isNaN(notificationId)) {
      sendApiError(res, req, 400, ApiErrors.invalidNotificationId);
      return;
    }

    const success = await notificationService.markAsRead(notificationId, userId);

    if (success) {
      res.json({ message: 'Notification marked as read' });
    } else {
      sendApiError(res, req, 500, ApiErrors.failedMarkNotificationRead);
    }
  } catch (error) {
    logger.error('Mark notification as read error:', error);
    sendApiError(res, req, 500, ApiErrors.failedMarkNotificationRead);
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const success = await notificationService.markAllAsRead(userId);

    if (success) {
      res.json({ message: 'All notifications marked as read' });
    } else {
      sendApiError(res, req, 500, ApiErrors.failedMarkAllNotificationsRead);
    }
  } catch (error) {
    logger.error('Mark all as read error:', error);
    sendApiError(res, req, 500, ApiErrors.failedMarkAllNotificationsRead);
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    
    if (!userId) {
      sendApiError(res, req, 401, ApiErrors.unauthorized);
      return;
    }

    const notificationId = parseInt(id);
    if (isNaN(notificationId)) {
      sendApiError(res, req, 400, ApiErrors.invalidNotificationId);
      return;
    }

    const success = await notificationService.deleteNotification(notificationId, userId);

    if (success) {
      res.json({ message: 'Notification deleted' });
    } else {
      sendApiError(res, req, 500, ApiErrors.failedDeleteNotification);
    }
  } catch (error) {
    logger.error('Delete notification error:', error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteNotification);
  }
}

