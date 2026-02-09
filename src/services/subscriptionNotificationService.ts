/**
 * Subscription Notification Service
 * Scheduled job to check subscriptions and send notifications
 */

import { getPool, sql } from '../config/database';
import { logger } from '../utils/logger';
import * as notificationService from './notificationService';

const GRACE_PERIOD_DAYS = 2;
const EXPIRY_WARNING_DAYS = 2;

/**
 * Check for subscriptions expiring in 2 days and send warnings
 */
async function checkExpiringSubscriptions(): Promise<void> {
  try {
    const pool = await getPool();
    
    // Find subscriptions expiring in 2 days that haven't been notified
    const result = await pool.request().query(`
      SELECT 
        s.id as subscriptionId,
        s.userId,
        s.endDate,
        p.name as planName,
        u.email,
        u.name as userName
      FROM Subscriptions s
      JOIN Users u ON s.userId = u.id
      JOIN Plans p ON s.planId = p.id
      WHERE s.status = 'active'
        AND s.expiryNotificationSent = 0
        AND s.endDate IS NOT NULL
        AND DATEDIFF(day, GETDATE(), s.endDate) <= ${EXPIRY_WARNING_DAYS}
        AND DATEDIFF(day, GETDATE(), s.endDate) >= 0
        AND p.name != 'Free'
    `);

    for (const subscription of result.recordset) {
      try {
        // Send notification
        await notificationService.notifySubscriptionExpiring(
          subscription.userId,
          subscription.planName,
          subscription.endDate
        );

        // Mark as notified
        await pool
          .request()
          .input('subscriptionId', sql.Int, subscription.subscriptionId)
          .query(`
            UPDATE Subscriptions
            SET expiryNotificationSent = 1
            WHERE id = @subscriptionId
          `);

        logger.info(`Expiry warning sent for subscription ${subscription.subscriptionId}`);
      } catch (error) {
        logger.error(`Failed to send expiry warning for subscription ${subscription.subscriptionId}:`, error);
      }
    }

    if (result.recordset.length > 0) {
      logger.info(`Checked ${result.recordset.length} expiring subscriptions`);
    }
  } catch (error) {
    logger.error('Check expiring subscriptions error:', error);
  }
}

/**
 * Check for expired subscriptions and start grace period
 */
async function checkExpiredSubscriptions(): Promise<void> {
  try {
    const pool = await getPool();
    
    // Find subscriptions that just expired and need grace period
    const result = await pool.request().query(`
      SELECT 
        s.id as subscriptionId,
        s.userId,
        s.endDate,
        p.name as planName,
        u.email,
        u.name as userName
      FROM Subscriptions s
      JOIN Users u ON s.userId = u.id
      JOIN Plans p ON s.planId = p.id
      WHERE s.status = 'active'
        AND s.endDate IS NOT NULL
        AND s.endDate < GETDATE()
        AND s.gracePeriodStartDate IS NULL
        AND p.name != 'Free'
    `);

    for (const subscription of result.recordset) {
      try {
        const gracePeriodEndDate = new Date();
        gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + GRACE_PERIOD_DAYS);

        // Start grace period
        await pool
          .request()
          .input('subscriptionId', sql.Int, subscription.subscriptionId)
          .input('gracePeriodStartDate', sql.DateTime2, new Date())
          .input('gracePeriodEndDate', sql.DateTime2, gracePeriodEndDate)
          .query(`
            UPDATE Subscriptions
            SET gracePeriodStartDate = @gracePeriodStartDate,
                gracePeriodEndDate = @gracePeriodEndDate,
                status = 'expired'
            WHERE id = @subscriptionId
          `);

        // Send notification
        await notificationService.notifySubscriptionExpired(
          subscription.userId,
          subscription.planName,
          gracePeriodEndDate
        );

        logger.info(`Grace period started for subscription ${subscription.subscriptionId}`);
      } catch (error) {
        logger.error(`Failed to start grace period for subscription ${subscription.subscriptionId}:`, error);
      }
    }

    if (result.recordset.length > 0) {
      logger.info(`Started grace period for ${result.recordset.length} subscriptions`);
    }
  } catch (error) {
    logger.error('Check expired subscriptions error:', error);
  }
}

/**
 * Check for subscriptions past grace period and downgrade to free
 */
async function checkGracePeriodExpired(): Promise<void> {
  try {
    const pool = await getPool();
    
    // Find subscriptions past grace period
    const result = await pool.request().query(`
      SELECT 
        s.id as subscriptionId,
        s.userId,
        s.gracePeriodEndDate,
        p.name as planName,
        u.email,
        u.name as userName
      FROM Subscriptions s
      JOIN Users u ON s.userId = u.id
      JOIN Plans p ON s.planId = p.id
      WHERE s.status = 'expired'
        AND s.gracePeriodEndDate IS NOT NULL
        AND s.gracePeriodEndDate < GETDATE()
        AND p.name != 'Free'
    `);

    for (const subscription of result.recordset) {
      try {
        // Get Free plan ID
        const freePlanResult = await pool.request().query(`
          SELECT id FROM Plans WHERE name = 'Free'
        `);

        if (freePlanResult.recordset.length === 0) {
          logger.error('Free plan not found');
          continue;
        }

        const freePlanId = freePlanResult.recordset[0].id;

        // Downgrade to free plan
        await pool
          .request()
          .input('subscriptionId', sql.Int, subscription.subscriptionId)
          .input('freePlanId', sql.Int, freePlanId)
          .query(`
            UPDATE Subscriptions
            SET planId = @freePlanId,
                billingCycle = 'free',
                status = 'active',
                startDate = GETDATE(),
                endDate = NULL,
                gracePeriodStartDate = NULL,
                gracePeriodEndDate = NULL,
                notificationSent = 0,
                expiryNotificationSent = 0
            WHERE id = @subscriptionId
          `);

        // Send notification
        await notificationService.notifyDowngradedToFree(
          subscription.userId,
          subscription.planName
        );

        logger.info(`Downgraded subscription ${subscription.subscriptionId} to free plan`);
      } catch (error) {
        logger.error(`Failed to downgrade subscription ${subscription.subscriptionId}:`, error);
      }
    }

    if (result.recordset.length > 0) {
      logger.info(`Downgraded ${result.recordset.length} subscriptions to free plan`);
    }
  } catch (error) {
    logger.error('Check grace period expired error:', error);
  }
}

/**
 * Run all subscription checks
 */
export async function runSubscriptionChecks(): Promise<void> {
  logger.info('Running subscription notification checks...');
  
  await checkExpiringSubscriptions();
  await checkExpiredSubscriptions();
  await checkGracePeriodExpired();
  
  logger.info('Subscription notification checks completed');
}

/**
 * Start subscription check scheduler (runs every hour)
 */
export function startSubscriptionScheduler(): void {
  // Run immediately on startup
  runSubscriptionChecks().catch(error => {
    logger.error('Initial subscription check failed:', error);
  });

  // Then run every hour
  const intervalMs = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    runSubscriptionChecks().catch(error => {
      logger.error('Scheduled subscription check failed:', error);
    });
  }, intervalMs);

  logger.info('Subscription notification scheduler started (runs every hour)');
}

