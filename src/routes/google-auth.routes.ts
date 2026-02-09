import { Router } from 'express';
import { body } from 'express-validator';
import * as googleAuthController from '../controllers/google-auth.controller';
import { validate } from '../middleware/validation';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/auth/google - Authenticate with Google (token | access_token | code + redirect_uri)
router.post(
  '/google',
  authLimiter,
  validate([
    body('token').optional().notEmpty(),
    body('access_token').optional().notEmpty(),
    body('code').optional().notEmpty(),
    body('redirect_uri')
      .optional()
      .isURL({ require_tld: false }), // allow localhost
    body().custom((_, { req }) => {
      const { token, access_token: at, code } = req.body || {};
      if (token || at || code) return true;
      throw new Error('Google token, access_token, or code is required');
    }),
    body().custom((_, { req }) => {
      if (req.body?.code && !req.body?.redirect_uri) {
        throw new Error('redirect_uri is required when using code');
      }
      return true;
    }),
    body('locale').optional().isIn(['ar', 'en']),
  ]),
  googleAuthController.googleAuth
);

// GET /api/auth/google/config - Get Google OAuth configuration
router.get('/google/config', googleAuthController.getGoogleConfig);

export default router;

