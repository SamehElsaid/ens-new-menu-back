import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validation';
import { validateRequest } from '../middleware/zodValidation';
import { signupSchema, checkAvailabilitySchema, loginSchema } from '../validators/auth.validator';
import { 
  authLimiter, 
  passwordResetLimiter, 
  emailVerificationLimiter 
} from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// GET /api/auth/check-availability?email=xxx&phoneNumber=xxx
router.get(
  '/check-availability',
  validateRequest(checkAvailabilitySchema, 'query'),
  authController.checkAvailability
);

// POST /api/auth/signup
router.post(
  '/signup',
  authLimiter,
  validateRequest(signupSchema, 'body'),
  authController.signup
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  validateRequest(loginSchema, 'body'),
  authController.login
);

// GET /api/auth/verify-email?token=xxx
router.get('/verify-email', authController.verifyEmail);

// POST /api/auth/resend-verification
router.post(
  '/resend-verification',
  emailVerificationLimiter,
  validate([
    body('email').isEmail().normalizeEmail(),
    body('locale').optional().isIn(['ar', 'en']),
  ]),
  authController.resendVerification
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate([
    body('email').isEmail().normalizeEmail(),
    body('locale').optional().isIn(['ar', 'en']),
  ]),
  authController.forgotPassword
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  validate([
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
    body('locale').optional().isIn(['ar', 'en']),
  ]),
  authController.resetPassword
);

// GET /api/auth/me - Protected route
router.get('/me', requireAuth, authController.getMe);

// POST /api/auth/refresh - Refresh access token
router.post(
  '/refresh',
  validate([
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  ]),
  authController.refreshToken
);

// POST /api/auth/logout - Logout (revoke tokens)
router.post(
  '/logout',
  requireAuth,
  authController.logout
);

export default router;


