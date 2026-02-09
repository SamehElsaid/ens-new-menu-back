import { getPool, sql } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Refresh Token Service
 * Manages refresh token storage and rotation
 */

export class RefreshTokenService {
  /**
   * Store a new refresh token
   */
  static async storeToken(
    userId: number,
    token: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      const pool = await getPool();
      
      await pool
        .request()
        .input('userId', sql.Int, userId)
        .input('token', sql.NVarChar, token)
        .input('expiresAt', sql.DateTime2, expiresAt)
        .query(`
          INSERT INTO RefreshTokens (userId, token, expiresAt)
          VALUES (@userId, @token, @expiresAt)
        `);
      
      logger.info(`Refresh token stored for user ${userId}`);
    } catch (error) {
      logger.error('Error storing refresh token:', error);
      throw error;
    }
  }

  /**
   * Verify and get refresh token
   */
  static async verifyToken(token: string): Promise<{
    isValid: boolean;
    userId?: number;
    isRevoked?: boolean;
    replacedByToken?: string;
  }> {
    try {
      const pool = await getPool();
      
      const result = await pool
        .request()
        .input('token', sql.NVarChar, token)
        .query(`
          SELECT userId, isRevoked, expiresAt, replacedByToken
          FROM RefreshTokens
          WHERE token = @token
        `);
      
      if (result.recordset.length === 0) {
        return { isValid: false };
      }
      
      const tokenData = result.recordset[0];
      
      // Check if token is revoked (may have been replaced by rotation)
      if (tokenData.isRevoked) {
        return {
          isValid: false,
          isRevoked: true,
          replacedByToken: tokenData.replacedByToken ?? undefined,
        };
      }
      
      // Check if token is expired
      const now = new Date();
      const expiresAt = new Date(tokenData.expiresAt);
      
      if (now > expiresAt) {
        return { isValid: false };
      }
      
      return {
        isValid: true,
        userId: tokenData.userId,
        isRevoked: false,
      };
    } catch (error) {
      logger.error('Error verifying refresh token:', error);
      return { isValid: false };
    }
  }

  /**
   * Rotate refresh token (revoke old, issue new)
   */
  static async rotateToken(
    oldToken: string,
    newToken: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      const pool = await getPool();
      
      // Get userId from old token
      const tokenData = await this.verifyToken(oldToken);
      
      if (!tokenData.isValid || !tokenData.userId) {
        throw new Error('Invalid refresh token');
      }
      
      // Revoke old token and store new one in a transaction
      const transaction = pool.transaction();
      await transaction.begin();
      
      try {
        // Revoke old token
        await transaction
          .request()
          .input('oldToken', sql.NVarChar, oldToken)
          .input('newToken', sql.NVarChar, newToken)
          .query(`
            UPDATE RefreshTokens
            SET isRevoked = 1, 
                revokedAt = GETDATE(),
                replacedByToken = @newToken
            WHERE token = @oldToken
          `);
        
        // Store new token
        await transaction
          .request()
          .input('userId', sql.Int, tokenData.userId)
          .input('token', sql.NVarChar, newToken)
          .input('expiresAt', sql.DateTime2, expiresAt)
          .query(`
            INSERT INTO RefreshTokens (userId, token, expiresAt)
            VALUES (@userId, @token, @expiresAt)
          `);
        
        await transaction.commit();
        logger.info(`Refresh token rotated for user ${tokenData.userId}`);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error rotating refresh token:', error);
      throw error;
    }
  }

  /**
   * Revoke a refresh token
   */
  static async revokeToken(token: string, reason?: string): Promise<void> {
    try {
      const pool = await getPool();
      
      await pool
        .request()
        .input('token', sql.NVarChar, token)
        .query(`
          UPDATE RefreshTokens
          SET isRevoked = 1, revokedAt = GETDATE()
          WHERE token = @token AND isRevoked = 0
        `);
      
      logger.info(`Refresh token revoked: ${reason || 'User request'}`);
    } catch (error) {
      logger.error('Error revoking refresh token:', error);
      throw error;
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  static async revokeAllUserTokens(userId: number): Promise<void> {
    try {
      const pool = await getPool();
      
      await pool
        .request()
        .input('userId', sql.Int, userId)
        .query(`
          UPDATE RefreshTokens
          SET isRevoked = 1, revokedAt = GETDATE()
          WHERE userId = @userId AND isRevoked = 0
        `);
      
      logger.info(`All refresh tokens revoked for user ${userId}`);
    } catch (error) {
      logger.error('Error revoking all user tokens:', error);
      throw error;
    }
  }

  /**
   * Clean up expired tokens (run periodically)
   */
  static async cleanupExpired(): Promise<number> {
    try {
      const pool = await getPool();
      
      // Delete tokens expired more than 30 days ago
      const result = await pool
        .request()
        .query(`
          DELETE FROM RefreshTokens
          WHERE expiresAt < DATEADD(DAY, -30, GETDATE())
        `);
      
      const deletedCount = result.rowsAffected[0];
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired refresh tokens`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up refresh tokens:', error);
      return 0;
    }
  }

  /**
   * Get active token count for a user
   */
  static async getUserActiveTokenCount(userId: number): Promise<number> {
    try {
      const pool = await getPool();
      
      const result = await pool
        .request()
        .input('userId', sql.Int, userId)
        .query(`
          SELECT COUNT(*) as count
          FROM RefreshTokens
          WHERE userId = @userId 
            AND isRevoked = 0 
            AND expiresAt > GETDATE()
        `);
      
      return result.recordset[0].count;
    } catch (error) {
      logger.error('Error getting active token count:', error);
      return 0;
    }
  }
}

