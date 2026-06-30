/**
 * Subscription Notification Service
 * Scheduled job to check subscriptions and send notifications
 */

import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import * as notificationService from "./notificationService";
import { SubscriptionDowngradeService } from "./subscriptionDowngrade.service";

const EXPIRY_WARNING_5_DAYS = 5;
const EXPIRY_WARNING_1_DAY = 1;

/**
 * Send warning when subscription has 5 days left (notificationSent flag).
 */
async function checkExpiring5DaySubscriptions(): Promise<void> {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT 
        s.id as subscriptionId,
        s.userId,
        s.endDate,
        p.name as planName
      FROM Subscriptions s
      JOIN Plans p ON s.planId = p.id
      WHERE s.status = 'active'
        AND s.notificationSent = 0
        AND s.endDate IS NOT NULL
        AND DATEDIFF(day, GETDATE(), s.endDate) = ${EXPIRY_WARNING_5_DAYS}
        AND p.name != 'Free'
    `);

    for (const subscription of result.recordset) {
      try {
        await notificationService.notifySubscriptionExpiringInDays(
          subscription.userId,
          subscription.planName,
          subscription.endDate,
          EXPIRY_WARNING_5_DAYS,
        );

        await pool
          .request()
          .input("subscriptionId", sql.Int, subscription.subscriptionId)
          .query(`
            UPDATE Subscriptions
            SET notificationSent = 1
            WHERE id = @subscriptionId
          `);

        logger.info(
          `5-day expiry warning sent for subscription ${subscription.subscriptionId}`,
        );
      } catch (error) {
        logger.error(
          `Failed to send 5-day expiry warning for subscription ${subscription.subscriptionId}:`,
          error,
        );
      }
    }
  } catch (error) {
    logger.error("Check 5-day expiring subscriptions error:", error);
  }
}

/**
 * Send warning when subscription has 1 day left (expiryNotificationSent flag).
 */
async function checkExpiring1DaySubscriptions(): Promise<void> {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT 
        s.id as subscriptionId,
        s.userId,
        s.endDate,
        p.name as planName
      FROM Subscriptions s
      JOIN Plans p ON s.planId = p.id
      WHERE s.status = 'active'
        AND s.expiryNotificationSent = 0
        AND s.endDate IS NOT NULL
        AND DATEDIFF(day, GETDATE(), s.endDate) = ${EXPIRY_WARNING_1_DAY}
        AND p.name != 'Free'
    `);

    for (const subscription of result.recordset) {
      try {
        await notificationService.notifySubscriptionExpiringInDays(
          subscription.userId,
          subscription.planName,
          subscription.endDate,
          EXPIRY_WARNING_1_DAY,
        );

        await pool
          .request()
          .input("subscriptionId", sql.Int, subscription.subscriptionId)
          .query(`
            UPDATE Subscriptions
            SET expiryNotificationSent = 1
            WHERE id = @subscriptionId
          `);

        logger.info(
          `1-day expiry warning sent for subscription ${subscription.subscriptionId}`,
        );
      } catch (error) {
        logger.error(
          `Failed to send 1-day expiry warning for subscription ${subscription.subscriptionId}:`,
          error,
        );
      }
    }
  } catch (error) {
    logger.error("Check 1-day expiring subscriptions error:", error);
  }
}

/**
 * Expire subscriptions immediately and downgrade to Free (no grace period).
 */
async function checkExpiredSubscriptionsAndDowngrade(): Promise<void> {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT 
        s.id as subscriptionId,
        s.userId,
        p.name as planName
      FROM Subscriptions s
      JOIN Plans p ON s.planId = p.id
      WHERE p.name != 'Free'
        AND (
          (s.status = 'active' AND s.endDate IS NOT NULL AND s.endDate < GETDATE())
          OR (s.status = 'expired' AND s.gracePeriodEndDate IS NOT NULL)
        )
    `);

    for (const subscription of result.recordset) {
      try {
        const processed =
          await SubscriptionDowngradeService.expireAndDowngradePaidSubscriptionsForUser(
            subscription.userId,
          );

        if (processed > 0) {
          await notificationService.notifyDowngradedToFree(
            subscription.userId,
            subscription.planName,
          );

          logger.info(
            `Expired and downgraded subscription ${subscription.subscriptionId} to free plan`,
          );
        }
      } catch (error) {
        logger.error(
          `Failed to expire/downgrade subscription ${subscription.subscriptionId}:`,
          error,
        );
      }
    }

    if (result.recordset.length > 0) {
      logger.info(
        `Processed ${result.recordset.length} expired subscriptions (immediate downgrade)`,
      );
    }
  } catch (error) {
    logger.error("Check expired subscriptions error:", error);
  }
}

/**
 * Run all subscription checks
 */
export async function runSubscriptionChecks(): Promise<void> {
  logger.info("Running subscription notification checks...");

  await checkExpiring5DaySubscriptions();
  await checkExpiring1DaySubscriptions();
  await checkExpiredSubscriptionsAndDowngrade();

  logger.info("Subscription notification checks completed");
}

/**
 * Start subscription check scheduler (runs every hour)
 */
export function startSubscriptionScheduler(): void {
  runSubscriptionChecks().catch((error) => {
    logger.error("Initial subscription check failed:", error);
  });

  const intervalMs = 60 * 60 * 1000;
  setInterval(() => {
    runSubscriptionChecks().catch((error) => {
      logger.error("Scheduled subscription check failed:", error);
    });
  }, intervalMs);

  logger.info("Subscription notification scheduler started (runs every hour)");
}
