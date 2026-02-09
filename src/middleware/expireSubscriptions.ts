import { Request, Response, NextFunction } from 'express';
import { getPool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Middleware to check and expire subscriptions automatically
 * This runs on every request that requires authentication
 */
export async function checkExpiredSubscriptions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Only check if user is authenticated
    if (!req.user?.userId) {
      next();
      return;
    }

    const pool = await getPool();

    // Update expired subscriptions for current user only (lightweight check)
    await pool.request().query(`
      UPDATE Subscriptions
      SET status = 'expired'
      WHERE userId = ${req.user.userId}
        AND status = 'active'
        AND endDate IS NOT NULL
        AND endDate <= GETDATE()
    `);

    next();
  } catch (error) {
    logger.error('Check expired subscriptions error:', error);
    // Don't block the request if subscription check fails
    next();
  }
}

/**
 * Service function to expire all subscriptions globally
 * This should be called periodically (e.g., via cron job)
 */
export async function expireAllSubscriptions(): Promise<number> {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      UPDATE Subscriptions
      SET status = 'expired'
      OUTPUT DELETED.id
      WHERE status = 'active'
        AND endDate IS NOT NULL
        AND endDate <= GETDATE()
    `);

    const expiredCount = result.recordset.length;
    logger.info(`Expired ${expiredCount} subscriptions`);
    
    return expiredCount;
  } catch (error) {
    logger.error('Expire all subscriptions error:', error);
    throw error;
  }
}

