import { getPool, sql } from '../config/database';
import { logger } from '../utils/logger';

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
        SELECT id, name, maxMenus, maxProductsPerMenu
        FROM Plans
        WHERE priceMonthly = 0
      `);

      if (freePlanResult.recordset.length === 0) {
        logger.error('Free plan not found');
        return;
      }

      const freePlan = freePlanResult.recordset[0];
      const { maxMenus, maxProductsPerMenu } = freePlan;

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

      // If user has more menus than allowed in free plan
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

      // For each menu, limit products to free plan limit
      for (const menu of userMenus) {
        const productsResult = await pool.request()
          .input('menuId', sql.Int, menu.id)
          .query(`
            SELECT id, createdAt
            FROM MenuItems
            WHERE menuId = @menuId
            ORDER BY createdAt ASC
          `);

        const products = productsResult.recordset;

        if (products.length > maxProductsPerMenu && maxProductsPerMenu !== -1) {
          // Delete products exceeding the limit (keep oldest ones)
          const productsToDelete = products.slice(maxProductsPerMenu);

          for (const product of productsToDelete) {
            await pool.request()
              .input('productId', sql.Int, product.id)
              .query(`
                DELETE FROM MenuItems
                WHERE id = @productId
              `);

            logger.info(`Deleted product ${product.id} from menu ${menu.id} (exceeded free plan limit)`);
          }
        }
      }

      // Delete all ads from user's menus (free plan doesn't support ads)
      const adsResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          DELETE FROM Ads
          OUTPUT DELETED.id
          WHERE menuId IN (
            SELECT id FROM Menus WHERE userId = @userId
          )
        `);

      if (adsResult.recordset.length > 0) {
        logger.info(`Deleted ${adsResult.recordset.length} ads for user ${userId} (free plan doesn't support ads)`);
      }

      // Delete all branches (free plan doesn't support branches)
      const branchesResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
          DELETE FROM Branches
          OUTPUT DELETED.id
          WHERE menuId IN (
            SELECT id FROM Menus WHERE userId = @userId
          )
        `);

      if (branchesResult.recordset.length > 0) {
        logger.info(`Deleted ${branchesResult.recordset.length} branches for user ${userId} (free plan doesn't support branches)`);
      }

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

