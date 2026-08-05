import { Router } from 'express';
import { body } from 'express-validator';
import * as appleAuthController from '../controllers/apple-auth.controller';
import { validate } from '../middleware/validation';

const router = Router();

// POST /api/auth/apple - Authenticate with Apple identityToken
router.post(
  '/apple',
  validate([
    body('identityToken').optional().notEmpty(),
    body('token').optional().notEmpty(),
    body().custom((_, { req }) => {
      const { identityToken, token } = req.body || {};
      if (identityToken || token) return true;
      throw new Error('Apple identityToken (or token) is required');
    }),
    body('email').optional().isEmail(),
    body('name').optional(),
    body('name.firstName').optional().isString(),
    body('name.lastName').optional().isString(),
    body('name.givenName').optional().isString(),
    body('name.familyName').optional().isString(),
    body('locale').optional().isIn(['ar', 'en']),
  ]),
  appleAuthController.appleAuth,
);

// GET /api/auth/apple/config - Get Apple Sign In configuration
router.get('/apple/config', appleAuthController.getAppleConfig);

// POST /api/auth/apple/notifications - Apple Server-to-Server notifications
router.post('/apple/notifications', appleAuthController.appleNotifications);

export default router;
