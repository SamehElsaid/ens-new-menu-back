/**
 * Notification Service
 * Handles creating and managing user notifications
 */

import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { sendFcmToUser } from "./fcmPush.service";

export interface NotificationData {
  userId: number;
  type:
    | "subscription_created"
    | "subscription_expiring"
    | "subscription_expiring_5d"
    | "subscription_expiring_1d"
    | "subscription_expired"
    | "downgraded_to_free";
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  metadata?: Record<string, any>;
}

/**
 * Create a new notification for a user
 */
export async function createNotification(
  data: NotificationData,
): Promise<boolean> {
  try {
    const pool = await getPool();

    await pool
      .request()
      .input("userId", sql.Int, data.userId)
      .input("type", sql.NVarChar, data.type)
      .input("title", sql.NVarChar, data.title)
      .input("titleAr", sql.NVarChar, data.titleAr)
      .input("message", sql.NVarChar, data.message)
      .input("messageAr", sql.NVarChar, data.messageAr)
      .input(
        "metadata",
        sql.NVarChar,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ).query(`
        INSERT INTO Notifications (userId, type, title, titleAr, message, messageAr, metadata, createdAt)
        VALUES (@userId, @type, @title, @titleAr, @message, @messageAr, @metadata, GETDATE())
      `);

    logger.info(`Notification created for user ${data.userId}: ${data.type}`);

    void sendFcmToUser(data.userId, {
      title: data.title,
      body: data.message,
      data: {
        type: data.type,
        title: data.title,
        titleAr: data.titleAr,
        message: data.message,
        messageAr: data.messageAr,
        ...(data.metadata ? { metadata: JSON.stringify(data.metadata) } : {}),
      },
    });

    return true;
  } catch (error) {
    logger.error("Create notification error:", error);
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
      .input("userId", sql.Int, userId)
      .input("limit", sql.Int, limit).query(`
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
      metadata: notification.metadata
        ? JSON.parse(notification.metadata)
        : null,
    }));
  } catch (error) {
    logger.error("Get user notifications error:", error);
    return [];
  }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: number): Promise<number> {
  try {
    const pool = await getPool();

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT COUNT(*) as count
        FROM Notifications
        WHERE userId = @userId AND isRead = 0
      `);

    return result.recordset[0]?.count || 0;
  } catch (error) {
    logger.error("Get unread count error:", error);
    return 0;
  }
}

/**
 * Mark notification as read
 */
export async function markAsRead(
  notificationId: number,
  userId: number,
): Promise<boolean> {
  try {
    const pool = await getPool();

    await pool
      .request()
      .input("notificationId", sql.Int, notificationId)
      .input("userId", sql.Int, userId).query(`
        UPDATE Notifications
        SET isRead = 1, readAt = GETDATE()
        WHERE id = @notificationId AND userId = @userId
      `);

    return true;
  } catch (error) {
    logger.error("Mark as read error:", error);
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: number): Promise<boolean> {
  try {
    const pool = await getPool();

    await pool.request().input("userId", sql.Int, userId).query(`
        UPDATE Notifications
        SET isRead = 1, readAt = GETDATE()
        WHERE userId = @userId AND isRead = 0
      `);

    return true;
  } catch (error) {
    logger.error("Mark all as read error:", error);
    return false;
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(
  notificationId: number,
  userId: number,
): Promise<boolean> {
  try {
    const pool = await getPool();

    await pool
      .request()
      .input("notificationId", sql.Int, notificationId)
      .input("userId", sql.Int, userId).query(`
        DELETE FROM Notifications
        WHERE id = @notificationId AND userId = @userId
      `);

    return true;
  } catch (error) {
    logger.error("Delete notification error:", error);
    return false;
  }
}

/**
 * Create subscription created notification
 */
export async function notifySubscriptionCreated(
  userId: number,
  planName: string,
  endDate: Date,
): Promise<void> {
  const formattedDate = endDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedDateAr = endDate.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await createNotification({
    userId,
    type: "subscription_created",
    title: `Welcome to ${planName} Plan!`,
    titleAr: `مرحباً بك في خطة ${planName}!`,
    message: `Your subscription has been activated successfully. Your plan will remain active until ${formattedDate}. Enjoy all the premium features!`,
    messageAr: `تم تفعيل اشتراكك بنجاح. ستبقى خطتك نشطة حتى ${formattedDateAr}. استمتع بجميع المميزات المتقدمة!`,
    metadata: { planName, endDate: endDate.toISOString() },
  });
}

/**
 * Warn user N days before subscription end (5 days or 1 day).
 */
export async function notifySubscriptionExpiringInDays(
  userId: number,
  planName: string,
  endDate: Date,
  daysRemaining: number,
): Promise<void> {
  const formattedDate = endDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedDateAr = endDate.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const isOneDay = daysRemaining <= 1;

  await createNotification({
    userId,
    type: isOneDay ? "subscription_expiring_1d" : "subscription_expiring_5d",
    title: isOneDay
      ? "Your Subscription Expires Tomorrow"
      : "5 Days Left on Your Subscription",
    titleAr: isOneDay
      ? "اشتراكك ينتهي غداً"
      : "تبقى 5 أيام على اشتراكك",
    message: isOneDay
      ? `Your ${planName} subscription expires tomorrow (${formattedDate}). Renew now to keep Pro features without interruption.`
      : `Your ${planName} subscription expires in 5 days (${formattedDate}). Renew now to continue enjoying premium features.`,
    messageAr: isOneDay
      ? `ينتهي اشتراكك في خطة ${planName} غداً (${formattedDateAr}). جدّد الآن للاستمرار في مميزات Pro دون انقطاع.`
      : `تبقى 5 أيام على انتهاء اشتراكك في خطة ${planName} (${formattedDateAr}). جدّد الآن للاستمرار في الاستفادة من المميزات المتقدمة.`,
    metadata: {
      planName,
      endDate: endDate.toISOString(),
      daysRemaining,
    },
  });
}

/** @deprecated Use notifySubscriptionExpiringInDays */
export async function notifySubscriptionExpiring(
  userId: number,
  planName: string,
  endDate: Date,
): Promise<void> {
  await notifySubscriptionExpiringInDays(userId, planName, endDate, 2);
}

/**
 * Create subscription expired notification
 */
export async function notifySubscriptionExpired(
  userId: number,
  planName: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "subscription_expired",
    title: "Subscription Expired",
    titleAr: "انتهى الاشتراك",
    message: `Your ${planName} subscription has expired. Your account has been moved to the Free plan. Renew anytime to restore full access.`,
    messageAr: `انتهى اشتراكك في خطة ${planName} وتم تحويل حسابك إلى الخطة المجانية. يمكنك التجديد في أي وقت لاستعادة الوصول الكامل.`,
    metadata: { planName },
  });
}

/**
 * Create downgrade to free notification
 */
export async function notifyDowngradedToFree(
  userId: number,
  oldPlanName: string,
): Promise<void> {
  await createNotification({
    userId,
    type: "downgraded_to_free",
    title: "Account Downgraded to Free Plan",
    titleAr: "تم تحويل حسابك إلى الخطة المجانية",
    message: `Your ${oldPlanName} subscription has ended and your account has been downgraded to the Free plan. Some features may be limited. Upgrade anytime to restore full access.`,
    messageAr: `لقد انتهى اشتراكك في خطة ${oldPlanName} وتم تحويل حسابك إلى الخطة المجانية. قد تكون بعض المميزات محدودة. يمكنك الترقية في أي وقت لاستعادة الوصول الكامل.`,
    metadata: { oldPlanName },
  });
}
