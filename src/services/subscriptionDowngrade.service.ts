import { getPool, sql } from '../config/database';
import { logger } from '../utils/logger';
import { getFreePlanCapabilities } from './planCapabilities.service';

/**
 * Service to handle subscription downgrades
 * When a user's subscription expires or is downgraded,
 * this service enforces the new plan limits
 */
export class SubscriptionDowngradeService {
  /**
   * Handle user downgrade to free plan
   * Applies default settings and disables features not available in free plan
   */
  static async handleDowngradeToFree(userId: number): Promise<void> {
    try {
      const pool = await getPool();

      // Get free plan limits
      const freePlanResult = await pool.request().query(`
        SELECT id, name, maxMenus
        FROM Plans
        WHERE priceMonthly = 0
      `);

      if (freePlanResult.recordset.length === 0) {
        logger.error('Free plan not found');
        return;
      }

      const freePlan = freePlanResult.recordset[0];
      const { maxMenus } = freePlan;

      await pool.request().input("userId", sql.Int, userId).query(`
        UPDATE Subscriptions
        SET extraMenus = 0
        WHERE userId = @userId AND status = 'active'
      `);

      // Get user's current menus
      const menusResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT id, isActive, createdAt
          FROM Menus
          WHERE userId = @userId
          ORDER BY createdAt ASC
        `);

      const userMenus = menusResult.recordset;

      logger.info(`User ${userId} has ${userMenus.length} menus, free plan allows ${maxMenus}`);

      const activeMenus = userMenus.filter(
        (menu: { isActive: boolean }) => menu.isActive,
      );

      if (activeMenus.length > maxMenus) {
        const menusToDeactivate = activeMenus.slice(maxMenus);

        for (const menu of menusToDeactivate) {
          await pool
            .request()
            .input("menuId", sql.Int, menu.id)
            .query(`
              UPDATE Menus
              SET isActive = 0
              WHERE id = @menuId
            `);

          logger.info(
            `Deactivated menu ${menu.id} for user ${userId} (exceeded free plan active limit)`,
          );
        }
      }

      // Deactivate menus beyond the free plan slot count (by creation order)
      if (userMenus.length > maxMenus) {
        // Keep the oldest menus active, deactivate the rest
        const menusToKeep = userMenus.slice(0, maxMenus);
        const menusToDeactivate = userMenus.slice(maxMenus);

        for (const menu of menusToDeactivate) {
          await pool.request()
            .input('menuId', sql.Int, menu.id)
            .query(`
              UPDATE Menus
              SET isActive = 0
              WHERE id = @menuId
            `);

          logger.info(`Deactivated menu ${menu.id} for user ${userId} (exceeded free plan limit)`);
        }
      }

      // Products/items are kept on downgrade — free plan limits only block new additions (see checkProductLimit)

      // Pause excess active ads (do not delete) so the user can re-enable within Free quota later
      const freeCaps = await getFreePlanCapabilities();
      const maxAdsPerMenu = freeCaps.maxAdsPerMenu;

      if (maxAdsPerMenu >= 0) {
        const adsResult = await pool
          .request()
          .input('userId', sql.Int, userId)
          .input('maxAds', sql.Int, maxAdsPerMenu)
          .query(`
            WITH RankedActiveAds AS (
              SELECT a.id,
                ROW_NUMBER() OVER (
                  PARTITION BY a.menuId
                  ORDER BY a.createdAt ASC, a.id ASC
                ) AS rn
              FROM Ads a
              INNER JOIN Menus m ON a.menuId = m.id
              WHERE m.userId = @userId
                AND a.adType = 'menu'
                AND ISNULL(a.isActive, 0) = 1
            )
            UPDATE Ads
            SET isActive = 0
            OUTPUT INSERTED.id
            WHERE id IN (
              SELECT id FROM RankedActiveAds WHERE rn > @maxAds
            )
          `);

        if (adsResult.recordset.length > 0) {
          logger.info(
            `Paused ${adsResult.recordset.length} excess ads for user ${userId} (free plan allows ${maxAdsPerMenu} active ad(s) per menu)`,
          );
        }
      }

      // Pro-only data (branches, distance delivery mode, etc.) is kept in DB — access is locked via requireProPlan at runtime.

      logger.info(`Successfully applied free plan limits for user ${userId}`);
    } catch (error) {
      logger.error(`Error handling downgrade for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user should be downgraded and apply limits
   */
  static async checkAndApplyDowngrade(userId: number): Promise<void> {
    try {
      const pool = await getPool();

      // Check if user has an active subscription
      const subResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT s.id, p.priceMonthly, p.name
          FROM Subscriptions s
          JOIN Plans p ON s.planId = p.id
          WHERE s.userId = @userId
            AND s.status = 'active'
            AND (s.endDate IS NULL OR s.endDate > GETDATE())
        `);

      // If no active subscription or only has free plan
      if (subResult.recordset.length === 0 || subResult.recordset[0].priceMonthly === 0) {
        // Check if user previously had a paid subscription
        const hadPaidSubResult = await pool.request()
          .input('userId', sql.Int, userId)
          .query(`
            SELECT TOP 1 s.id
            FROM Subscriptions s
            JOIN Plans p ON s.planId = p.id
            WHERE s.userId = @userId
              AND p.priceMonthly > 0
              AND s.status = 'expired'
            ORDER BY s.endDate DESC
          `);

        if (hadPaidSubResult.recordset.length > 0) {
          logger.info(`User ${userId} has been downgraded to free plan, applying limits...`);
          await this.handleDowngradeToFree(userId);
        }
      }
    } catch (error) {
      logger.error(`Error checking downgrade for user ${userId}:`, error);
    }
  }

  /**
   * Expire paid subscriptions past end date (or legacy grace period) and move user to Free.
   * Returns number of subscriptions processed.
   */
  static async expireAndDowngradePaidSubscriptionsForUser(
    userId: number,
  ): Promise<number> {
    try {
      const pool = await getPool();

      const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT s.id as subscriptionId, p.name as planName
        FROM Subscriptions s
        JOIN Plans p ON s.planId = p.id
        WHERE s.userId = @userId
          AND p.name != 'Free'
          AND (
            (s.status = 'active' AND s.endDate IS NOT NULL AND s.endDate < GETDATE())
            OR (s.status = 'expired' AND s.gracePeriodEndDate IS NOT NULL)
          )
      `);

      if (result.recordset.length === 0) {
        return 0;
      }

      const freePlanResult = await pool.request().query(`
        SELECT id FROM Plans WHERE name = 'Free'
      `);

      if (freePlanResult.recordset.length === 0) {
        logger.error("Free plan not found");
        return 0;
      }

      const freePlanId = freePlanResult.recordset[0].id;

      for (const subscription of result.recordset) {
        await pool
          .request()
          .input("subscriptionId", sql.Int, subscription.subscriptionId)
          .input("freePlanId", sql.Int, freePlanId)
          .query(`
            UPDATE Subscriptions
            SET planId = @freePlanId,
                billingCycle = 'free',
                status = 'active',
                startDate = GETDATE(),
                endDate = NULL,
                extraMenus = 0,
                gracePeriodStartDate = NULL,
                gracePeriodEndDate = NULL,
                notificationSent = 0,
                expiryNotificationSent = 0
            WHERE id = @subscriptionId
          `);
      }

      await this.handleDowngradeToFree(userId);
      return result.recordset.length;
    } catch (error) {
      logger.error(
        `Error expiring/downgrading subscriptions for user ${userId}:`,
        error,
      );
      return 0;
    }
  }

  /**
   * Apply downgrade immediately when subscription expires
   */
  static async onSubscriptionExpire(subscriptionId: number, userId: number): Promise<void> {
    try {
      const pool = await getPool();

      // Check if this was a paid subscription
      const subResult = await pool.request()
        .input('subscriptionId', sql.Int, subscriptionId)
        .query(`
          SELECT s.id, p.priceMonthly, p.name
          FROM Subscriptions s
          JOIN Plans p ON s.planId = p.id
          WHERE s.id = @subscriptionId
        `);

      if (subResult.recordset.length > 0 && subResult.recordset[0].priceMonthly > 0) {
        logger.info(`Paid subscription ${subscriptionId} expired for user ${userId}, applying free plan limits...`);
        await this.handleDowngradeToFree(userId);
      }
    } catch (error) {
      logger.error(`Error handling subscription expiry for subscription ${subscriptionId}:`, error);
    }
  }
}

