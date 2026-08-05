import appleSignin from 'apple-signin-auth';
import { getPool, sql, executeTransaction } from '../config/database';
import { logger } from '../utils/logger';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../utils/tokenHelper';
import { RefreshTokenService } from './refreshToken.service';
import { ROLES } from '../config/constants';
import { sendWelcomeEmail } from './emailService';
import { getAuthUserProfile } from './userProfile.service';

export interface AppleUserInfo {
  sub: string; // Apple user ID (stable per app group)
  email: string;
  email_verified: boolean;
  name: string;
  is_private_email?: boolean;
}

export interface AppleNamePayload {
  firstName?: string;
  lastName?: string;
}

function getAppleAudiences(): string[] {
  const multi = process.env.APPLE_CLIENT_IDS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (multi?.length) return multi;

  const single = process.env.APPLE_CLIENT_ID?.trim();
  if (single) return [single];

  return [];
}

function buildDisplayName(
  name: AppleNamePayload | undefined,
  email: string | undefined,
): string {
  const first = name?.firstName?.trim() || '';
  const last = name?.lastName?.trim() || '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (email) return email.split('@')[0] || email;
  return 'Apple User';
}

export class AppleOAuthService {
  /**
   * Verify Apple identityToken (JWT) and return user info.
   * Optional `name` is only sent by Apple on the FIRST authorization — client must forward it.
   * Optional `email` from client is used as fallback when token has no email (subsequent logins).
   */
  static async verifyAppleToken(
    identityToken: string,
    options?: {
      name?: AppleNamePayload;
      email?: string;
    },
  ): Promise<AppleUserInfo> {
    const audiences = getAppleAudiences();
    if (!audiences.length) {
      throw new Error('Apple Sign In is not configured (APPLE_CLIENT_ID)');
    }

    try {
      const payload = await appleSignin.verifyIdToken(identityToken, {
        audience: audiences,
        ignoreExpiration: false,
      });

      if (!payload?.sub) {
        throw new Error('Invalid Apple token');
      }

      const email =
        (payload.email || options?.email || '').toLowerCase().trim();

      // Apple may omit email on subsequent sign-ins; allow empty here —
      // findOrCreate will resolve via providerId (SocialAccounts).
      const emailVerified =
        payload.email_verified === true ||
        payload.email_verified === 'true' ||
        (!!payload.email && payload.email_verified !== false);

      return {
        sub: payload.sub,
        email,
        email_verified: emailVerified,
        name: buildDisplayName(options?.name, email || undefined),
        is_private_email:
          payload.is_private_email === true ||
          payload.is_private_email === 'true',
      };
    } catch (error: any) {
      logger.error('Apple token verification error:', error?.message || error);
      if (error?.message?.includes('not configured')) {
        throw error;
      }
      throw new Error('Invalid Apple token');
    }
  }

  /**
   * Verify Apple server-to-server notification JWT (events).
   */
  static async verifyWebhookToken(payloadJwt: string) {
    const audiences = getAppleAudiences();
    if (!audiences.length) {
      throw new Error('Apple Sign In is not configured (APPLE_CLIENT_ID)');
    }

    return appleSignin.verifyWebhookToken(payloadJwt, {
      audience: audiences,
    });
  }

  /**
   * Find or create user with Apple account (SocialAccounts provider='apple').
   */
  static async findOrCreateAppleUser(
    appleUserInfo: AppleUserInfo,
    locale: 'ar' | 'en' = 'ar',
  ) {
    const pool = await getPool();

    try {
      // 1) Existing social account
      const socialAccountResult = await pool
        .request()
        .input('provider', sql.NVarChar, 'apple')
        .input('providerId', sql.NVarChar, appleUserInfo.sub)
        .query(`
          SELECT sa.*, u.*
          FROM SocialAccounts sa
          INNER JOIN Users u ON sa.userId = u.id
          WHERE sa.provider = @provider AND sa.providerId = @providerId
        `);

      if (socialAccountResult.recordset.length > 0) {
        const user = socialAccountResult.recordset[0];

        await pool
          .request()
          .input('userId', sql.Int, user.userId)
          .input('provider', sql.NVarChar, 'apple')
          .input(
            'providerEmail',
            sql.NVarChar,
            appleUserInfo.email || user.providerEmail || user.email,
          )
          .input(
            'providerName',
            sql.NVarChar,
            appleUserInfo.name || user.providerName || user.name,
          )
          .query(`
            UPDATE SocialAccounts
            SET providerEmail = @providerEmail,
                providerName = @providerName,
                updatedAt = GETDATE()
            WHERE userId = @userId AND provider = @provider
          `);

        await pool
          .request()
          .input('userId', sql.Int, user.userId)
          .query(`
            UPDATE Users
            SET lastLoginAt = GETDATE()
            WHERE id = @userId
          `);

        return {
          userId: user.userId,
          email: user.email,
          name: user.name,
          role: user.role,
          profileImage: user.profileImage || null,
          isNew: false,
        };
      }

      // New Apple link requires an email (first sign-in)
      if (!appleUserInfo.email) {
        throw new Error('Apple email required for first sign-in');
      }

      // 2) Link by email if user already exists
      const emailResult = await pool
        .request()
        .input('email', sql.NVarChar, appleUserInfo.email.toLowerCase())
        .query('SELECT * FROM Users WHERE email = @email');

      if (emailResult.recordset.length > 0) {
        const existingUser = emailResult.recordset[0];
        const userId = existingUser.id as number;

        await pool
          .request()
          .input('userId', sql.Int, userId)
          .input('provider', sql.NVarChar, 'apple')
          .input('providerId', sql.NVarChar, appleUserInfo.sub)
          .input('providerEmail', sql.NVarChar, appleUserInfo.email)
          .input('providerName', sql.NVarChar, appleUserInfo.name)
          .query(`
            INSERT INTO SocialAccounts (userId, provider, providerId, providerEmail, providerName, providerPhoto)
            VALUES (@userId, @provider, @providerId, @providerEmail, @providerName, NULL)
          `);

        await pool
          .request()
          .input('userId', sql.Int, userId)
          .input('isEmailVerified', sql.Bit, appleUserInfo.email_verified ? 1 : 0)
          .query(`
            UPDATE Users
            SET lastLoginAt = GETDATE(),
                isEmailVerified = CASE
                  WHEN isEmailVerified = 1 THEN 1
                  ELSE @isEmailVerified
                END,
                emailVerifiedAt = CASE
                  WHEN isEmailVerified = 1 THEN emailVerifiedAt
                  WHEN @isEmailVerified = 1 THEN GETDATE()
                  ELSE emailVerifiedAt
                END
            WHERE id = @userId
          `);

        return {
          userId: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          role: existingUser.role,
          profileImage: existingUser.profileImage || null,
          isNew: false,
        };
      }

      // 3) Create new user
      const freePlanResult = await pool.request().query(`
        SELECT id FROM Plans WHERE name = 'Free'
      `);
      if (!freePlanResult.recordset.length) {
        logger.error('Free plan not found in Plans table');
        throw new Error('Free plan not configured');
      }
      const freePlanId = freePlanResult.recordset[0].id;

      const newUserId = await executeTransaction(async (transaction) => {
        const userResult = await transaction
          .request()
          .input('email', sql.NVarChar, appleUserInfo.email.toLowerCase())
          .input('name', sql.NVarChar, appleUserInfo.name)
          .input('role', sql.NVarChar, ROLES.USER)
          .input('isEmailVerified', sql.Bit, appleUserInfo.email_verified ? 1 : 0)
          .query(`
            INSERT INTO Users (email, name, role, profileImage, isEmailVerified, emailVerifiedAt, password)
            OUTPUT INSERTED.id
            VALUES (@email, @name, @role, NULL, @isEmailVerified,
                    CASE WHEN @isEmailVerified = 1 THEN GETDATE() ELSE NULL END,
                    NULL)
          `);

        const createdUserId = userResult.recordset[0].id as number;

        await transaction
          .request()
          .input('userId', sql.Int, createdUserId)
          .input('provider', sql.NVarChar, 'apple')
          .input('providerId', sql.NVarChar, appleUserInfo.sub)
          .input('providerEmail', sql.NVarChar, appleUserInfo.email)
          .input('providerName', sql.NVarChar, appleUserInfo.name)
          .query(`
            INSERT INTO SocialAccounts (userId, provider, providerId, providerEmail, providerName, providerPhoto)
            VALUES (@userId, @provider, @providerId, @providerEmail, @providerName, NULL)
          `);

        await transaction
          .request()
          .input('userId', sql.Int, createdUserId)
          .input('planId', sql.Int, freePlanId)
          .input('billingCycle', sql.NVarChar, 'free')
          .query(`
            INSERT INTO Subscriptions (userId, planId, billingCycle, status, paymentStatus, paidAt, amount)
            VALUES (@userId, @planId, @billingCycle, 'active', 'completed', GETDATE(), 0)
          `);

        return createdUserId;
      });

      try {
        sendWelcomeEmail(appleUserInfo.email, appleUserInfo.name, locale).catch(
          () => {
            logger.warn('Welcome email failed to send (non-critical)');
          },
        );
      } catch {
        // Ignore email errors
      }

      return {
        userId: newUserId,
        email: appleUserInfo.email,
        name: appleUserInfo.name,
        role: ROLES.USER,
        profileImage: null as string | null,
        isNew: true,
      };
    } catch (error) {
      logger.error('Apple user creation error:', error);
      throw error;
    }
  }

  /**
   * Handle Apple account delete / email disable events from S2S notifications.
   */
  static async handleAppleNotificationEvent(event: {
    type?: string;
    sub?: string;
    email?: string;
  }): Promise<void> {
    if (!event.sub) {
      logger.warn('Apple S2S event missing sub', { event });
      return;
    }

    const pool = await getPool();
    const type = (event.type || '').toLowerCase();

    logger.info('Apple S2S notification', {
      type,
      sub: event.sub,
      email: event.email,
    });

    // account-delete / consent-withdrawn → soft-mark or unlink social account
    if (
      type === 'account-delete' ||
      type === 'consent-revoked' ||
      type === 'consent-withdrawn'
    ) {
      await pool
        .request()
        .input('provider', sql.NVarChar, 'apple')
        .input('providerId', sql.NVarChar, event.sub)
        .query(`
          DELETE FROM SocialAccounts
          WHERE provider = @provider AND providerId = @providerId
        `);
      logger.info('Unlinked Apple social account after S2S event', {
        type,
        sub: event.sub,
      });
      return;
    }

    // email-disabled / email-enabled — log only for now
    if (type === 'email-disabled' || type === 'email-enabled') {
      logger.info('Apple email forwarding preference changed', {
        type,
        sub: event.sub,
        email: event.email,
      });
    }
  }

  static async generateAuthTokens(user: {
    userId: number;
    email: string;
    name: string;
    role: string;
    profileImage: string | null;
  }) {
    const tokenPayload = {
      id: user.userId,
      userId: user.userId,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setFullYear(refreshTokenExpiry.getFullYear() + 100);
    await RefreshTokenService.storeToken(
      user.userId,
      refreshToken,
      refreshTokenExpiry,
    );

    const userProfile = await getAuthUserProfile(user.userId);

    return {
      user: userProfile,
      accessToken,
      refreshToken,
    };
  }
}
