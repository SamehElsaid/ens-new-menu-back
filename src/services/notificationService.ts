/**
 * Notification Service
 * Handles creating and managing user notifications
 */

import { getPool, sql } from '../config/database';
import { logger } from '../utils/logger';

export interface NotificationData {
  userId: number;
  type: 'subscription_created' | 'subscription_expiring' | 'subscription_expired' | 'downgraded_to_free';
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  metadata?: Record<string, any>;
}

/**
 * Create a new notification for a user
 */
export async function createNotification(data: NotificationData): Promise<boolean> {
  try {
    const pool = await getPool();
    
    await pool
      .request()
      .input('userId', sql.Int, data.userId)
      .input('type', sql.NVarChar, data.type)
      .input('title', sql.NVarChar, data.title)
      .input('titleAr', sql.NVarChar, data.titleAr)
      .input('message', sql.NVarChar, data.message)
      .input('messageAr', sql.NVarChar, data.messageAr)
      .input('metadata', sql.NVarChar, data.metadata ? JSON.stringify(data.metadata) : null)
      .query(`
        INSERT INTO Notifications (userId, type, title, titleAr, message, messageAr, metadata, createdAt)
        VALUES (@userId, @type, @title, @titleAr, @message, @messageAr, @metadata, GETDATE())
      `);

    logger.info(`Notification created for user ${data.userId}: ${data.type}`);
    return true;
  } catch (error) {
    logger.error('Create notification error:', error);
    return false;
  }
}

/**
 * Get all notifications for a user
 */
export async function getUserNotifications(userId: number, limit: number = 50) {
  try {
    const pool = await getPool();
    
    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) 
          id,
          type,
          title,
          titleAr,
          message,
          messageAr,
          isRead,
          metadata,
          createdAt,
          readAt
        FROM Notifications
        WHERE userId = @userId
        ORDER BY createdAt DESC
      `);

    return result.recordset.map((notification: any) => ({
      ...notification,
      metadata: notification.metadata ? JSON.parse(notification.metadata) : null
    }));
  } catch (error) {
    logger.error('Get user notifications error:', error);
    return [];
  }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: number): Promise<number> {
  try {
    const pool = await getPool();
    
    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT COUNT(*) as count
        FROM Notifications
        WHERE userId = @userId AND isRead = 0
      `);

    return result.recordset[0]?.count || 0;
  } catch (error) {
    logger.error('Get unread count error:', error);
    return 0;
  }
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: number, userId: number): Promise<boolean> {
  try {
    const pool = await getPool();
    
    await pool
      .request()
      .input('notificationId', sql.Int, notificationId)
      .input('userId', sql.Int, userId)
      .query(`
        UPDATE Notifications
        SET isRead = 1, readAt = GETDATE()
        WHERE id = @notificationId AND userId = @userId
      `);

    return true;
  } catch (error) {
    logger.error('Mark as read error:', error);
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: number): Promise<boolean> {
  try {
    const pool = await getPool();
    
    await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        UPDATE Notifications
        SET isRead = 1, readAt = GETDATE()
        WHERE userId = @userId AND isRead = 0
      `);

    return true;
  } catch (error) {
    logger.error('Mark all as read error:', error);
    return false;
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: number, userId: number): Promise<boolean> {
  try {
    const pool = await getPool();
    
    await pool
      .request()
      .input('notificationId', sql.Int, notificationId)
      .input('userId', sql.Int, userId)
      .query(`
        DELETE FROM Notifications
        WHERE id = @notificationId AND userId = @userId
      `);

    return true;
  } catch (error) {
    logger.error('Delete notification error:', error);
    return false;
  }
}

/**
 * Create subscription created notification
 */
export async function notifySubscriptionCreated(
  userId: number,
  planName: string,
  endDate: Date
): Promise<void> {
  const formattedDate = endDate.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const formattedDateAr = endDate.toLocaleDateString('ar-SA', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  await createNotification({
    userId,
    type: 'subscription_created',
    title: `Welcome to ${planName} Plan!`,
    titleAr: `مرحباً بك في خطة ${planName}!`,
    message: `Your subscription has been activated successfully. Your plan will remain active until ${formattedDate}. Enjoy all the premium features!`,
    messageAr: `تم تفعيل اشتراكك بنجاح. ستبقى خطتك نشطة حتى ${formattedDateAr}. استمتع بجميع المميزات المتقدمة!`,
    metadata: { planName, endDate: endDate.toISOString() }
  });
}

/**
 * Create subscription expiring notification (2 days before)
 */
export async function notifySubscriptionExpiring(
  userId: number,
  planName: string,
  endDate: Date
): Promise<void> {
  const formattedDate = endDate.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const formattedDateAr = endDate.toLocaleDateString('ar-SA', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  await createNotification({
    userId,
    type: 'subscription_expiring',
    title: 'Your Subscription is Expiring Soon',
    titleAr: 'اشتراكك على وشك الانتهاء',
    message: `Your ${planName} subscription will expire on ${formattedDate}. Renew now to continue enjoying premium features without interruption.`,
    messageAr: `سينتهي اشتراكك في خطة ${planName} في ${formattedDateAr}. جدد الآن للاستمرار في الاستفادة من المميزات المتقدمة دون انقطاع.`,
    metadata: { planName, endDate: endDate.toISOString() }
  });
}

/**
 * Create subscription expired notification (grace period started)
 */
export async function notifySubscriptionExpired(
  userId: number,
  planName: string,
  gracePeriodEndDate: Date
): Promise<void> {
  const formattedDate = gracePeriodEndDate.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const formattedDateAr = gracePeriodEndDate.toLocaleDateString('ar-SA', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  await createNotification({
    userId,
    type: 'subscription_expired',
    title: 'Subscription Expired - Grace Period Active',
    titleAr: 'انتهى الاشتراك - فترة سماح نشطة',
    message: `Your ${planName} subscription has expired. You have a 2-day grace period until ${formattedDate} to renew before being downgraded to the Free plan.`,
    messageAr: `لقد انتهى اشتراكك في خطة ${planName}. لديك فترة سماح لمدة يومين حتى ${formattedDateAr} للتجديد قبل التحويل إلى الخطة المجانية.`,
    metadata: { planName, gracePeriodEndDate: gracePeriodEndDate.toISOString() }
  });
}

/**
 * Create downgrade to free notification
 */
export async function notifyDowngradedToFree(
  userId: number,
  oldPlanName: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'downgraded_to_free',
    title: 'Account Downgraded to Free Plan',
    titleAr: 'تم تحويل حسابك إلى الخطة المجانية',
    message: `Your ${oldPlanName} subscription has ended and your account has been downgraded to the Free plan. Some features may be limited. Upgrade anytime to restore full access.`,
    messageAr: `لقد انتهى اشتراكك في خطة ${oldPlanName} وتم تحويل حسابك إلى الخطة المجانية. قد تكون بعض المميزات محدودة. يمكنك الترقية في أي وقت لاستعادة الوصول الكامل.`,
    metadata: { oldPlanName }
  });
}

