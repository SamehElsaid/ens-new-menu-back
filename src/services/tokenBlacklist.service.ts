import { getPool, sql } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Token Blacklist Service
 * Manages revoked/blacklisted JWT tokens
 */

export class TokenBlacklistService {
  /**
   * Add a token to the blacklist
   */
  static async addToBlacklist(
    token: string,
    userId: number,
    tokenType: 'access' | 'refresh',
    expiresAt: Date,
    reason?: string
  ): Promise<void> {
    try {
      const pool = await getPool();
      
      await pool
        .request()
        .input('token', sql.NVarChar, token)
        .input('userId', sql.Int, userId)
        .input('tokenType', sql.NVarChar, tokenType)
        .input('reason', sql.NVarChar, reason || 'User logout')
        .input('expiresAt', sql.DateTime2, expiresAt)
        .query(`
          INSERT INTO TokenBlacklist (token, userId, tokenType, reason, expiresAt)
          VALUES (@token, @userId, @tokenType, @reason, @expiresAt)
        `);
      
      logger.info(`Token blacklisted for user ${userId}`);
    } catch (error) {
      logger.error('Error adding token to blacklist:', error);
      throw error;
    }
  }

  /**
   * Check if a token is blacklisted
   */
  static async isBlacklisted(token: string): Promise<boolean> {
    try {
      const pool = await getPool();
      
      const result = await pool
        .request()
        .input('token', sql.NVarChar, token)
        .query(`
          SELECT id FROM TokenBlacklist 
          WHERE token = @token AND expiresAt > GETDATE()
        `);
      
      return result.recordset.length > 0;
    } catch (error) {
      logger.error('Error checking token blacklist:', error);
      // In case of error, assume token is not blacklisted to avoid blocking legitimate users
      return false;
    }
  }

  /**
   * Revoke all tokens for a user (e.g., on password change)
   */
  static async revokeAllUserTokens(userId: number, reason: string): Promise<void> {
    try {
      const pool = await getPool();
      
      // Get all active refresh tokens for the user
      const tokensResult = await pool
        .request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT token FROM RefreshTokens 
          WHERE userId = @userId AND isRevoked = 0 AND expiresAt > GETDATE()
        `);
      
      // Revoke all refresh tokens
      await pool
        .request()
        .input('userId', sql.Int, userId)
        .input('reason', sql.NVarChar, reason)
        .query(`
          UPDATE RefreshTokens 
          SET isRevoked = 1, revokedAt = GETDATE()
          WHERE userId = @userId AND isRevoked = 0
        `);
      
      logger.info(`All tokens revoked for user ${userId}: ${reason}`);
    } catch (error) {
      logger.error('Error revoking user tokens:', error);
      throw error;
    }
  }

  /**
   * Clean up expired blacklisted tokens (run periodically)
   */
  static async cleanupExpired(): Promise<number> {
    try {
      const pool = await getPool();
      
      const result = await pool
        .request()
        .query(`
          DELETE FROM TokenBlacklist 
          WHERE expiresAt < GETDATE()
        `);
      
      const deletedCount = result.rowsAffected[0];
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired blacklisted tokens`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up blacklist:', error);
      return 0;
    }
  }
}

