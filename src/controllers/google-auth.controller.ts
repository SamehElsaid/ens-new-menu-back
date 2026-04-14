import { Request, Response } from 'express';
import { GoogleOAuthService } from '../services/google-oauth.service';
import { logger } from '../utils/logger';
import { LoginAttemptsService } from '../services/loginAttempts.service';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';

/**
 * Handle Google OAuth login/signup
 * Accepts: token (ID token) | access_token (implicit) | code + redirect_uri (auth-code)
 */
export async function googleAuth(req: Request, res: Response): Promise<void> {
  try {
    const { token, access_token: accessToken, code, redirect_uri: redirectUri, locale = 'ar' } = req.body;
    const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'];

    if (!token && !accessToken && !code) {
      sendApiError(res, req, 400, ApiErrors.googleTokenRequired);
      return;
    }

    let googleUserInfo;
    if (code) {
      if (!redirectUri) {
        sendApiError(res, req, 400, ApiErrors.redirectUriRequiredWithCode);
        return;
      }
      googleUserInfo = await GoogleOAuthService.getUserInfoFromCode(code, redirectUri);
    } else if (accessToken) {
      googleUserInfo = await GoogleOAuthService.getUserInfoFromAccessToken(accessToken);
    } else {
      googleUserInfo = await GoogleOAuthService.verifyGoogleToken(token);
    }

    // Check if account is locked (for existing email-based accounts)
    const lockStatus = await LoginAttemptsService.isAccountLocked(googleUserInfo.email);
    if (lockStatus.isLocked) {
      const en = lockStatus.message || ApiErrors.accountTemporarilyLocked.en;
      sendApiError(
        res,
        req,
        403,
        { en, ar: ApiErrors.accountTemporarilyLocked.ar },
        { isLocked: true, lockedUntil: lockStatus.lockedUntil },
      );
      return;
    }

    // Find or create user
    const user = await GoogleOAuthService.findOrCreateGoogleUser(googleUserInfo, locale as 'ar' | 'en');

    // Reset failed login attempts for this email
    await LoginAttemptsService.resetFailedAttempts(googleUserInfo.email);

    // Record successful login
    await LoginAttemptsService.recordAttempt(googleUserInfo.email, ipAddress, true, userAgent);

    // Generate tokens
    const authResponse = await GoogleOAuthService.generateAuthTokens(user);

    // Debug: Log user data to verify profileImage is included
    logger.info('Google auth response:', {
      userId: user.userId,
      email: user.email,
      profileImage: user.profileImage,
      isNew: user.isNew,
    });

    res.json({
      message: user.isNew ? 'Account created successfully' : 'Login successful',
      isNew: user.isNew,
      ...authResponse,
    });
  } catch (error: any) {
    logger.error('Google auth error:', error);
    
    if (error.message === 'Invalid Google token') {
      sendApiError(res, req, 400, ApiErrors.invalidGoogleToken);
      return;
    }

    sendApiError(res, req, 500, ApiErrors.failedGoogleAuth);
  }
}

/**
 * Get Google OAuth configuration for frontend
 */
export async function getGoogleConfig(req: Request, res: Response): Promise<void> {
  try {
    res.json({
      clientId: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (error) {
    logger.error('Get Google config error:', error);
    sendApiError(res, req, 500, ApiErrors.failedGoogleConfig);
  }
}

