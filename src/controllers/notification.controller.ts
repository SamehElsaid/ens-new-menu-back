/**
 * Notification Controller
 * Handles notification-related HTTP requests
 */

import { Request, Response } from 'express';
import * as notificationService from '../services/notificationService';
import { logger } from '../utils/logger';

/**
 * Get all notifications for the authenticated user
 */
export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const notifications = await notificationService.getUserNotifications(userId, limit);

    res.json({ notifications });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const count = await notificationService.getUnreadCount(userId);

    res.json({ count });
  } catch (error) {
    logger.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
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
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const notificationId = parseInt(id);
    if (isNaN(notificationId)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const success = await notificationService.markAsRead(notificationId, userId);

    if (success) {
      res.json({ message: 'Notification marked as read' });
    } else {
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  } catch (error) {
    logger.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const success = await notificationService.markAllAsRead(userId);

    if (success) {
      res.json({ message: 'All notifications marked as read' });
    } else {
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  } catch (error) {
    logger.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
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
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const notificationId = parseInt(id);
    if (isNaN(notificationId)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const success = await notificationService.deleteNotification(notificationId, userId);

    if (success) {
      res.json({ message: 'Notification deleted' });
    } else {
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
}

