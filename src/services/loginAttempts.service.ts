import { getPool, sql } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Login Attempts Service
 * Manages failed login attempts and account lockout
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30; // Lock account for 30 minutes
const ATTEMPT_WINDOW_MINUTES = 15; // Count attempts within last 15 minutes

export class LoginAttemptsService {
  /**
   * Record a login attempt
   */
  static async recordAttempt(
    email: string,
    ipAddress: string,
    success: boolean,
    userAgent?: string
  ): Promise<void> {
    try {
      const pool = await getPool();
      
      await pool
        .request()
        .input('email', sql.NVarChar, email.toLowerCase())
        .input('ipAddress', sql.NVarChar, ipAddress)
        .input('success', sql.Bit, success)
        .input('userAgent', sql.NVarChar, userAgent || null)
        .query(`
          INSERT INTO LoginAttempts (email, ipAddress, success, userAgent)
          VALUES (@email, @ipAddress, @success, @userAgent)
        `);
    } catch (error) {
      logger.error('Error recording login attempt:', error);
      // Don't throw - login should continue even if logging fails
    }
  }

  /**
   * Check if account should be locked based on failed attempts
   */
  static async checkAndLockAccount(email: string): Promise<{
    shouldLock: boolean;
    remainingAttempts: number;
    lockedUntil?: Date;
  }> {
    try {
      const pool = await getPool();
      
      // Count failed attempts in the last window
      const attemptsResult = await pool
        .request()
        .input('email', sql.NVarChar, email.toLowerCase())
        .input('windowMinutes', sql.Int, ATTEMPT_WINDOW_MINUTES)
        .query(`
          SELECT COUNT(*) as count
          FROM LoginAttempts
          WHERE email = @email 
            AND success = 0
            AND attemptedAt > DATEADD(MINUTE, -@windowMinutes, GETDATE())
        `);
      
      const failedCount = attemptsResult.recordset[0].count;
      const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - failedCount);
      
      if (failedCount >= MAX_FAILED_ATTEMPTS) {
        // Lock the account
        const lockedUntil = new Date();
        lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
        
        await pool
          .request()
          .input('email', sql.NVarChar, email.toLowerCase())
          .input('lockedUntil', sql.DateTime2, lockedUntil)
          .input('failedAttempts', sql.Int, failedCount)
          .query(`
            UPDATE Users 
            SET isLocked = 1, 
                lockedUntil = @lockedUntil,
                failedLoginAttempts = @failedAttempts,
                lastFailedLoginAt = GETDATE()
            WHERE email = @email
          `);
        
        logger.warn(`Account locked for email: ${email} (${failedCount} failed attempts)`);
        
        return {
          shouldLock: true,
          remainingAttempts: 0,
          lockedUntil,
        };
      }
      
      return {
        shouldLock: false,
        remainingAttempts,
      };
    } catch (error) {
      logger.error('Error checking account lock:', error);
      return {
        shouldLock: false,
        remainingAttempts: MAX_FAILED_ATTEMPTS,
      };
    }
  }

  /**
   * Check if account is currently locked
   */
  static async isAccountLocked(email: string): Promise<{
    isLocked: boolean;
    lockedUntil?: Date;
    message?: string;
  }> {
    try {
      const pool = await getPool();
      
      const result = await pool
        .request()
        .input('email', sql.NVarChar, email.toLowerCase())
        .query(`
          SELECT isLocked, lockedUntil, failedLoginAttempts
          FROM Users
          WHERE email = @email
        `);
      
      if (result.recordset.length === 0) {
        return { isLocked: false };
      }
      
      const user = result.recordset[0];
      
      // Check if lock has expired
      if (user.isLocked && user.lockedUntil) {
        const now = new Date();
        const lockedUntil = new Date(user.lockedUntil);
        
        if (now > lockedUntil) {
          // Unlock the account
          await this.unlockAccount(email);
          return { isLocked: false };
        }
        
        const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000 / 60);
        
        return {
          isLocked: true,
          lockedUntil,
          message: `حسابك مقفل لمدة ${minutesRemaining} دقيقة بسبب محاولات تسجيل دخول فاشلة متعددة.`,
        };
      }
      
      return { isLocked: false };
    } catch (error) {
      logger.error('Error checking if account is locked:', error);
      return { isLocked: false };
    }
  }

  /**
   * Unlock an account
   */
  static async unlockAccount(email: string): Promise<void> {
    try {
      const pool = await getPool();
      
      await pool
        .request()
        .input('email', sql.NVarChar, email.toLowerCase())
        .query(`
          UPDATE Users 
          SET isLocked = 0, 
              lockedUntil = NULL,
              failedLoginAttempts = 0,
              lastFailedLoginAt = NULL
          WHERE email = @email
        `);
      
      logger.info(`Account unlocked for email: ${email}`);
    } catch (error) {
      logger.error('Error unlocking account:', error);
      throw error;
    }
  }

  /**
   * Reset failed attempts on successful login
   */
  static async resetFailedAttempts(email: string): Promise<void> {
    try {
      const pool = await getPool();
      
      await pool
        .request()
        .input('email', sql.NVarChar, email.toLowerCase())
        .query(`
          UPDATE Users 
          SET failedLoginAttempts = 0,
              lastFailedLoginAt = NULL,
              isLocked = 0,
              lockedUntil = NULL
          WHERE email = @email
        `);
    } catch (error) {
      logger.error('Error resetting failed attempts:', error);
      // Don't throw - login should continue
    }
  }

  /**
   * Clean up old login attempts (run periodically)
   */
  static async cleanupOldAttempts(): Promise<number> {
    try {
      const pool = await getPool();
      
      // Delete attempts older than 30 days
      const result = await pool
        .request()
        .query(`
          DELETE FROM LoginAttempts 
          WHERE attemptedAt < DATEADD(DAY, -30, GETDATE())
        `);
      
      const deletedCount = result.rowsAffected[0];
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old login attempts`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up login attempts:', error);
      return 0;
    }
  }

  /**
   * Get recent failed attempts for monitoring
   */
  static async getRecentFailedAttempts(
    email?: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const pool = await getPool();
      
      const request = pool.request().input('limit', sql.Int, limit);
      
      let query = `
        SELECT TOP (@limit) 
          email, ipAddress, attemptedAt, userAgent
        FROM LoginAttempts
        WHERE success = 0
      `;
      
      if (email) {
        request.input('email', sql.NVarChar, email.toLowerCase());
        query += ' AND email = @email';
      }
      
      query += ' ORDER BY attemptedAt DESC';
      
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting recent failed attempts:', error);
      return [];
    }
  }
}

