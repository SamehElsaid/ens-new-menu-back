/**
 * Notification Routes
 */

import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

// Get all notifications
router.get('/', notificationController.getNotifications);

// Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark notification as read
router.patch('/:id/read', notificationController.markNotificationAsRead);

// Mark all as read
router.patch('/read-all', notificationController.markAllAsRead);

// Delete notification
router.delete('/:id', notificationController.deleteNotification);

export default router;

