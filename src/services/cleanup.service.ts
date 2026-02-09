import { CronJob } from 'cron';
import { TokenBlacklistService } from './tokenBlacklist.service';
import { RefreshTokenService } from './refreshToken.service';
import { LoginAttemptsService } from './loginAttempts.service';
import { logger } from '../utils/logger';

/**
 * Cleanup Service
 * Scheduled tasks for cleaning up expired data
 */

export class CleanupService {
  private static cleanupJob: CronJob | null = null;

  /**
   * Start cleanup scheduler
   * Runs daily at 2:00 AM
   */
  static start(): void {
    if (this.cleanupJob) {
      logger.warn('Cleanup service is already running');
      return;
    }

    // Run every day at 2:00 AM
    this.cleanupJob = new CronJob(
      '0 2 * * *',
      async () => {
        logger.info('🧹 Starting scheduled cleanup...');
        
        try {
          // Clean up expired blacklisted tokens
          const blacklistedCount = await TokenBlacklistService.cleanupExpired();
          
          // Clean up expired refresh tokens
          const refreshTokenCount = await RefreshTokenService.cleanupExpired();
          
          // Clean up old login attempts
          const loginAttemptsCount = await LoginAttemptsService.cleanupOldAttempts();
          
          logger.info(
            `✅ Cleanup completed: ${blacklistedCount} blacklisted tokens, ` +
            `${refreshTokenCount} refresh tokens, ${loginAttemptsCount} login attempts`
          );
        } catch (error) {
          logger.error('❌ Cleanup error:', error);
        }
      },
      null,
      true,
      'UTC'
    );

    logger.info('✅ Cleanup service started (runs daily at 2:00 AM UTC)');
  }

  /**
   * Stop cleanup scheduler
   */
  static stop(): void {
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
      logger.info('Cleanup service stopped');
    }
  }

  /**
   * Run cleanup manually (for testing or maintenance)
   */
  static async runManual(): Promise<void> {
    logger.info('🧹 Running manual cleanup...');
    
    try {
      const blacklistedCount = await TokenBlacklistService.cleanupExpired();
      const refreshTokenCount = await RefreshTokenService.cleanupExpired();
      const loginAttemptsCount = await LoginAttemptsService.cleanupOldAttempts();
      
      logger.info(
        `✅ Manual cleanup completed: ${blacklistedCount} blacklisted tokens, ` +
        `${refreshTokenCount} refresh tokens, ${loginAttemptsCount} login attempts`
      );
    } catch (error) {
      logger.error('❌ Manual cleanup error:', error);
      throw error;
    }
  }
}

