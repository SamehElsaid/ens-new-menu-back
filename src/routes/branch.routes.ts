import { Router } from 'express';
import { body, query, param } from 'express-validator';
import * as branchController from '../controllers/branch.controller';
import { validate } from '../middleware/validation';
import { requireAuth } from '../middleware/auth.middleware';
import { requireProPlan } from '../middleware/planLimits';

const router = Router({ mergeParams: true }); // To access menuId from parent router

// All routes require authentication + Pro plan
router.use(requireAuth);
router.use(requireProPlan);

// GET /api/menus/:menuId/branches - Get branches
router.get(
  '/',
  [
    param('menuId').isInt(),
    query('locale').optional().isIn(['ar', 'en']),
  ],
  branchController.getBranches
);

// POST /api/menus/:menuId/branches - Create branch
router.post(
  '/',
  validate([
    param('menuId').isInt(),
    body('nameAr').notEmpty().trim().isLength({ max: 255 }),
    body('nameEn').notEmpty().trim().isLength({ max: 255 }),
    body('addressAr').optional().isString().trim().isLength({ max: 500 }),
    body('addressEn').optional().isString().trim().isLength({ max: 500 }),
    body('cityAr').optional().isString().trim().isLength({ max: 100 }),
    body('cityEn').optional().isString().trim().isLength({ max: 100 }),
    body('countryAr').optional().isString().trim().isLength({ max: 100 }),
    body('countryEn').optional().isString().trim().isLength({ max: 100 }),
    body('phone').optional().isString().trim().isLength({ max: 50 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('workingHours').optional().isString().trim().isLength({ max: 500 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('deliveryBasePrice').optional({ nullable: true }).isFloat({ min: 0 }),
    body('deliveryPricePerKm').optional({ nullable: true }).isFloat({ min: 0 }),
    body('maxDeliveryRadiusKm').optional({ nullable: true }).isFloat({ min: 0.1, max: 500 }),
    body('isActive').optional().isBoolean(),
  ]),
  branchController.createBranch
);

// PUT /api/menus/:menuId/branches/:branchId - Update branch
router.put(
  '/:branchId',
  validate([
    param('menuId').isInt(),
    param('branchId').isInt(),
    body('nameAr').optional().notEmpty().trim().isLength({ max: 255 }),
    body('nameEn').optional().notEmpty().trim().isLength({ max: 255 }),
    body('addressAr').optional().isString().trim().isLength({ max: 500 }),
    body('addressEn').optional().isString().trim().isLength({ max: 500 }),
    body('cityAr').optional().isString().trim().isLength({ max: 100 }),
    body('cityEn').optional().isString().trim().isLength({ max: 100 }),
    body('countryAr').optional().isString().trim().isLength({ max: 100 }),
    body('countryEn').optional().isString().trim().isLength({ max: 100 }),
    body('phone').optional().isString().trim().isLength({ max: 50 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('workingHours').optional().isString().trim().isLength({ max: 500 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('deliveryBasePrice').optional({ nullable: true }).isFloat({ min: 0 }),
    body('deliveryPricePerKm').optional({ nullable: true }).isFloat({ min: 0 }),
    body('maxDeliveryRadiusKm').optional({ nullable: true }).isFloat({ min: 0.1, max: 500 }),
    body('isActive').optional().isBoolean(),
  ]),
  branchController.updateBranch
);

// DELETE /api/menus/:menuId/branches/:branchId - Delete branch
router.delete(
  '/:branchId',
  [param('menuId').isInt(), param('branchId').isInt()],
  branchController.deleteBranch
);

export default router;


