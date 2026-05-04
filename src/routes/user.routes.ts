import { Router } from 'express';
import { body } from 'express-validator';
import * as userController from '../controllers/user.controller';
import { validate } from '../middleware/validation';
import { requireAuth, requireRestaurantOwner } from '../middleware/auth.middleware';
import { uploadMemoryStorage } from '../controllers/upload.controller';
import * as cashierController from '../controllers/cashier.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Multer only for multipart (so Form Data is parsed into req.body + req.file)
const optionalMultipartProfile = (req: any, res: any, next: any) => {
  if (!req.is('multipart/form-data')) return next();
  return uploadMemoryStorage.single('profileImage')(req, res, next);
};

// Restaurant owner — cashier (dashboard) accounts
router.get('/cashiers', requireRestaurantOwner, cashierController.listCashiers);
router.post(
  '/cashiers',
  requireRestaurantOwner,
  cashierController.cashierValidators.create,
  cashierController.createCashier,
);
router.patch(
  '/cashiers/:cashierId',
  requireRestaurantOwner,
  cashierController.cashierValidators.patch,
  cashierController.updateCashier,
);
router.delete(
  '/cashiers/:cashierId',
  requireRestaurantOwner,
  cashierController.cashierValidators.one,
  cashierController.deleteCashier,
);

// GET /api/user/profile - Get user profile
router.get('/profile', userController.getProfile);

// PUT /api/user/profile - Update user profile (JSON or multipart/form-data)
router.put(
  '/profile',
  optionalMultipartProfile,
  validate([
    body('name').optional().notEmpty().trim().isLength({ max: 255 }),
    body('phone').optional().isString().trim().isLength({ max: 50 }),
    body('phoneNumber').optional().isString().trim().isLength({ max: 50 }),
    body('country').optional().isString().trim().isLength({ max: 100 }),
    body('dateOfBirth').optional().isISO8601().toDate(),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('address').optional().isString().trim().isLength({ max: 500 }),
    body('profileImage').optional().isString().trim().isLength({ max: 500 }),
  ]),
  userController.updateProfile
);

// POST /api/user/change-password - Change password
router.post(
  '/change-password',
  validate([
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
  ]),
  userController.changePassword
);

// GET /api/user/statistics - Get user statistics
router.get('/statistics', userController.getStatistics);

// GET /api/user/subscription - Get user subscription
router.get('/subscription', userController.getSubscription);

// POST /api/user/upgrade-plan - Upgrade subscription plan
router.post(
  '/upgrade-plan',
  validate([
    body('planType').isIn(['free', 'monthly', 'yearly']),
  ]),
  userController.upgradePlan
);

// DELETE /api/user/account - Delete user account
router.delete(
  '/account',
  validate([
    body('password').notEmpty(),
  ]),
  userController.deleteAccount
);

export default router;


