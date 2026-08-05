import { Request, Response } from 'express';
import { AppleOAuthService } from '../services/apple-oauth.service';
import { logger } from '../utils/logger';
import { LoginAttemptsService } from '../services/loginAttempts.service';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';

/**
 * Handle Apple Sign In login/signup
 * Body: identityToken (required) | token (alias)
 * Optional: email, name { firstName, lastName }, locale
 */
export async function appleAuth(req: Request, res: Response): Promise<void> {
  try {
    const {
      identityToken,
      token,
      email,
      name,
      locale = 'ar',
    } = req.body;

    const appleToken = identityToken || token;
    const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown').replace(
      '::ffff:',
      '',
    );
    const userAgent = req.headers['user-agent'];

    if (!appleToken) {
      sendApiError(res, req, 400, ApiErrors.appleTokenRequired);
      return;
    }

    const appleUserInfo = await AppleOAuthService.verifyAppleToken(appleToken, {
      name:
        name && typeof name === 'object'
          ? {
              firstName: name.firstName || name.givenName,
              lastName: name.lastName || name.familyName,
            }
          : undefined,
      email: typeof email === 'string' ? email : undefined,
    });

    const lockEmail = appleUserInfo.email;
    if (lockEmail) {
      const lockStatus = await LoginAttemptsService.isAccountLocked(lockEmail);
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
    }

    const user = await AppleOAuthService.findOrCreateAppleUser(
      appleUserInfo,
      locale as 'ar' | 'en',
    );

    if (user.email) {
      await LoginAttemptsService.resetFailedAttempts(user.email);
      await LoginAttemptsService.recordAttempt(
        user.email,
        ipAddress,
        true,
        userAgent,
      );
    }

    const authResponse = await AppleOAuthService.generateAuthTokens(user);

    logger.info('Apple auth response:', {
      userId: user.userId,
      email: user.email,
      isNew: user.isNew,
    });

    res.json({
      message: user.isNew ? 'Account created successfully' : 'Login successful',
      isNew: user.isNew,
      ...authResponse,
    });
  } catch (error: any) {
    logger.error('Apple auth error:', error);

    if (error.message === 'Invalid Apple token') {
      sendApiError(res, req, 400, ApiErrors.invalidAppleToken);
      return;
    }

    if (error.message?.includes('not configured')) {
      sendApiError(res, req, 503, ApiErrors.appleNotConfigured);
      return;
    }

    if (error.message === 'Apple email required for first sign-in') {
      sendApiError(res, req, 400, ApiErrors.appleEmailRequired);
      return;
    }

    sendApiError(res, req, 500, ApiErrors.failedAppleAuth);
  }
}

/**
 * Get Apple Sign In configuration for frontend
 */
export async function getAppleConfig(req: Request, res: Response): Promise<void> {
  try {
    res.json({
      clientId: process.env.APPLE_CLIENT_ID || null,
      clientIds: process.env.APPLE_CLIENT_IDS
        ? process.env.APPLE_CLIENT_IDS.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : process.env.APPLE_CLIENT_ID
          ? [process.env.APPLE_CLIENT_ID]
          : [],
    });
  } catch (error) {
    logger.error('Get Apple config error:', error);
    sendApiError(res, req, 500, ApiErrors.failedAppleConfig);
  }
}

/**
 * Apple Server-to-Server Notification Endpoint
 * Apple POSTs a JWT in body.payload for account events.
 * URL to set in Apple Developer Console, e.g.:
 *   https://your-api.example.com/api/auth/apple/notifications
 */
export async function appleNotifications(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const payloadJwt =
      req.body?.payload ||
      req.body?.signedPayload ||
      (typeof req.body === 'string' ? req.body : null);

    if (!payloadJwt || typeof payloadJwt !== 'string') {
      // Acknowledge with 200 when empty to avoid Apple retries during setup tests
      logger.warn('Apple S2S notification missing payload', {
        bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
      });
      res.status(200).json({ received: true });
      return;
    }

    const decoded = await AppleOAuthService.verifyWebhookToken(payloadJwt);
    // Apple sends `events` as a single object (sometimes JSON-stringified)
    let event = (decoded as any)?.events;
    if (typeof event === 'string') {
      try {
        event = JSON.parse(event);
      } catch {
        event = { type: event };
      }
    }

    await AppleOAuthService.handleAppleNotificationEvent({
      type: event?.type,
      sub: event?.sub,
      email: event?.email,
    });

    res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error('Apple S2S notification error:', error?.message || error);
    // Return 200 so Apple does not endlessly retry on config mistakes during setup;
    // still log the failure for ops.
    res.status(200).json({ received: true, error: 'processing_failed' });
  }
}
