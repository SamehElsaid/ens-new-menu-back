import { OAuth2Client } from 'google-auth-library';
import { getPool, sql, executeTransaction } from '../config/database';
import { logger } from '../utils/logger';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../utils/tokenHelper';
import { RefreshTokenService } from './refreshToken.service';
import { ROLES } from '../config/constants';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export interface GoogleUserInfo {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Response shape from Google userinfo API */
interface GoogleUserinfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  error?: { message?: string };
}

export interface GoogleAuthUser {
  userId: number;
  email: string;
  name: string;
  role: string;
  profileImage: string | null;
  phoneNumber: string | null;
  isPhoneVerified: boolean;
  isNew: boolean;
}

export class GoogleOAuthService {
  private static async getUserAuthFields(userId: number) {
    const pool = await getPool();
    const result = await pool.request().input('userId', sql.Int, userId).query(`
      SELECT phoneNumber, isPhoneVerified, profileImage
      FROM Users
      WHERE id = @userId
    `);
    const row = result.recordset[0];
    return {
      phoneNumber: (row?.phoneNumber as string | null) ?? null,
      isPhoneVerified: Boolean(row?.isPhoneVerified),
      profileImage: (row?.profileImage as string | null) ?? null,
    };
  }

  /**
   * Get user info from OAuth authorization code (useGoogleLogin flow: 'auth-code')
   * Exchanges code for tokens then fetches user info.
   */
  static async getUserInfoFromCode(code: string, redirectUri: string): Promise<GoogleUserInfo> {
    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.access_token) {
      throw new Error('Invalid Google token');
    }
    return this.getUserInfoFromAccessToken(tokens.access_token);
  }

  /**
   * Get user info from OAuth access_token (useGoogleLogin flow: 'implicit')
   */
  static async getUserInfoFromAccessToken(accessToken: string): Promise<GoogleUserInfo> {
    try {
      const response = await fetch(`${GOOGLE_USERINFO_URL}?alt=json`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const raw = await response.json().catch(() => ({}));
      const payload: GoogleUserinfoResponse = typeof raw === 'object' && raw !== null ? raw : {};

      if (!response.ok) {
        logger.error('Google userinfo API error', {
          status: response.status,
          body: payload,
        });
        throw new Error(payload.error?.message || 'Invalid Google access token');
      }

      if (!payload.sub) {
        logger.error('Google userinfo missing sub', { payload });
        throw new Error('Invalid Google token');
      }

      return {
        sub: payload.sub,
        email: payload.email ?? '',
        email_verified: payload.email_verified ?? false,
        name: payload.name ?? payload.email ?? '',
        picture: payload.picture,
        given_name: payload.given_name,
        family_name: payload.family_name,
      };
    } catch (error: any) {
      logger.error('Google userinfo fetch error:', error?.message || error);
      throw new Error(error.message || 'Invalid Google token');
    }
  }

  /**
   * Verify Google ID token (credential) and get user info
   */
  static async verifyGoogleToken(token: string): Promise<GoogleUserInfo> {
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      
      const payload = ticket.getPayload();
      
      if (!payload) {
        throw new Error('Failed to get user info from Google token');
      }

      return {
        sub: payload.sub,
        email: payload.email!,
        email_verified: payload.email_verified || false,
        name: payload.name || payload.email!,
        picture: payload.picture,
        given_name: payload.given_name,
        family_name: payload.family_name,
      };
    } catch (error) {
      logger.error('Google token verification error:', error);
      throw new Error('Invalid Google token');
    }
  }

  /**
   * Find or create user with Google account
   */
  static async findOrCreateGoogleUser(
    googleUserInfo: GoogleUserInfo,
    locale: 'ar' | 'en' = 'ar',
  ): Promise<GoogleAuthUser> {
    const pool = await getPool();
    
    try {
      // Check if social account exists
      const socialAccountResult = await pool
        .request()
        .input('provider', sql.NVarChar, 'google')
        .input('providerId', sql.NVarChar, googleUserInfo.sub)
        .query(`
          SELECT sa.*, u.* 
          FROM SocialAccounts sa
          INNER JOIN Users u ON sa.userId = u.id
          WHERE sa.provider = @provider AND sa.providerId = @providerId
        `);

      // If account exists, update and return user
      if (socialAccountResult.recordset.length > 0) {
        const user = socialAccountResult.recordset[0];
        
        // Update social account info
        await pool
          .request()
          .input('userId', sql.Int, user.userId)
          .input('provider', sql.NVarChar, 'google')
          .input('providerEmail', sql.NVarChar, googleUserInfo.email)
          .input('providerName', sql.NVarChar, googleUserInfo.name)
          .input('providerPhoto', sql.NVarChar, googleUserInfo.picture || null)
          .query(`
            UPDATE SocialAccounts 
            SET providerEmail = @providerEmail,
                providerName = @providerName,
                providerPhoto = @providerPhoto,
                updatedAt = GETDATE()
            WHERE userId = @userId AND provider = @provider
          `);

        // Update profile image from Google if user doesn't have one
        await pool
          .request()
          .input('userId', sql.Int, user.userId)
          .input('profileImage', sql.NVarChar, googleUserInfo.picture || null)
          .query(`
            UPDATE Users 
            SET profileImage = CASE 
              WHEN profileImage IS NULL OR profileImage = '' THEN @profileImage 
              ELSE profileImage 
            END,
            lastLoginAt = GETDATE() 
            WHERE id = @userId
          `);

        const fields = await this.getUserAuthFields(user.userId);

        return {
          userId: user.userId,
          email: user.email,
          name: user.name,
          role: user.role,
          profileImage: fields.profileImage || user.profileImage,
          phoneNumber: fields.phoneNumber,
          isPhoneVerified: fields.isPhoneVerified,
          isNew: false,
        };
      }

      // Check if email already exists (user might have registered with email/password)
      const emailResult = await pool
        .request()
        .input('email', sql.NVarChar, googleUserInfo.email.toLowerCase())
        .query('SELECT * FROM Users WHERE email = @email');

      let userId: number;
      let isNew = false;

      if (emailResult.recordset.length > 0) {
        // Link existing user with Google account
        const existingUser = emailResult.recordset[0];
        userId = existingUser.id;

        await pool
          .request()
          .input('userId', sql.Int, userId)
          .input('provider', sql.NVarChar, 'google')
          .input('providerId', sql.NVarChar, googleUserInfo.sub)
          .input('providerEmail', sql.NVarChar, googleUserInfo.email)
          .input('providerName', sql.NVarChar, googleUserInfo.name)
          .input('providerPhoto', sql.NVarChar, googleUserInfo.picture || null)
          .query(`
            INSERT INTO SocialAccounts (userId, provider, providerId, providerEmail, providerName, providerPhoto)
            VALUES (@userId, @provider, @providerId, @providerEmail, @providerName, @providerPhoto)
          `);

        // Update profile image from Google if user doesn't have one
        await pool
          .request()
          .input('userId', sql.Int, userId)
          .input('profileImage', sql.NVarChar, googleUserInfo.picture || null)
          .query(`
            UPDATE Users 
            SET profileImage = CASE 
              WHEN profileImage IS NULL OR profileImage = '' THEN @profileImage 
              ELSE profileImage 
            END,
            lastLoginAt = GETDATE() 
            WHERE id = @userId
          `);

        const fields = await this.getUserAuthFields(userId);

        return {
          userId: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          role: existingUser.role,
          profileImage: fields.profileImage || existingUser.profileImage,
          phoneNumber: fields.phoneNumber,
          isPhoneVerified: fields.isPhoneVerified,
          isNew: false,
        };
      }

      // Get Free plan ID by name (don't assume id=1)
      const freePlanResult = await pool.request().query(`
        SELECT id FROM Plans WHERE name = 'Free'
      `);
      if (!freePlanResult.recordset.length) {
        logger.error('Free plan not found in Plans table');
        throw new Error('Free plan not configured');
      }
      const freePlanId = freePlanResult.recordset[0].id;

      // Create new user with Google account
      const result = await executeTransaction(async (transaction) => {
        // Insert new user (password is NULL for social login)
        const userResult = await transaction
          .request()
          .input('email', sql.NVarChar, googleUserInfo.email.toLowerCase())
          .input('name', sql.NVarChar, googleUserInfo.name)
          .input('role', sql.NVarChar, ROLES.USER)
          .input('profileImage', sql.NVarChar, googleUserInfo.picture || null)
          .input('isEmailVerified', sql.Bit, googleUserInfo.email_verified ? 1 : 0)
          .query(`
            INSERT INTO Users (email, name, role, profileImage, isEmailVerified, emailVerifiedAt, isPhoneVerified, password)
            OUTPUT INSERTED.id
            VALUES (@email, @name, @role, @profileImage, @isEmailVerified, 
                    CASE WHEN @isEmailVerified = 1 THEN GETDATE() ELSE NULL END,
                    0, NULL)
          `);

        const newUserId = userResult.recordset[0].id;

        // Create social account link
        await transaction
          .request()
          .input('userId', sql.Int, newUserId)
          .input('provider', sql.NVarChar, 'google')
          .input('providerId', sql.NVarChar, googleUserInfo.sub)
          .input('providerEmail', sql.NVarChar, googleUserInfo.email)
          .input('providerName', sql.NVarChar, googleUserInfo.name)
          .input('providerPhoto', sql.NVarChar, googleUserInfo.picture || null)
          .query(`
            INSERT INTO SocialAccounts (userId, provider, providerId, providerEmail, providerName, providerPhoto)
            VALUES (@userId, @provider, @providerId, @providerEmail, @providerName, @providerPhoto)
          `);

        // Create free subscription for new user (use Free plan ID from DB)
        await transaction
          .request()
          .input('userId', sql.Int, newUserId)
          .input('planId', sql.Int, freePlanId)
          .input('billingCycle', sql.NVarChar, 'free')
          .query(`
            INSERT INTO Subscriptions (userId, planId, billingCycle, status)
            VALUES (@userId, @planId, @billingCycle, 'active')
          `);

        return newUserId;
      });

      userId = result;
      isNew = true;

      return {
        userId,
        email: googleUserInfo.email,
        name: googleUserInfo.name,
        role: ROLES.USER,
        profileImage: googleUserInfo.picture || null,
        phoneNumber: null,
        isPhoneVerified: false,
        isNew,
      };
    } catch (error) {
      logger.error('Google user creation error:', error);
      throw error;
    }
  }

  /**
   * Generate auth tokens for user
   */
  static async generateAuthTokens(user: {
    userId: number;
    email: string;
    name: string;
    role: string;
    profileImage: string | null;
    phoneNumber?: string | null;
    isPhoneVerified?: boolean;
  }) {
    const tokenPayload = {
      id: user.userId,
      userId: user.userId,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store refresh token (no expiry - 100 years)
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setFullYear(refreshTokenExpiry.getFullYear() + 100);
    await RefreshTokenService.storeToken(user.userId, refreshToken, refreshTokenExpiry);

    return {
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        profileImage: user.profileImage,
        phoneNumber: user.phoneNumber ?? null,
        isPhoneVerified: user.isPhoneVerified ?? false,
      },
      accessToken,
      refreshToken,
    };
  }
}

