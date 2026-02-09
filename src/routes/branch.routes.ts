import { Router } from 'express';
import { body, query, param } from 'express-validator';
import * as branchController from '../controllers/branch.controller';
import { validate } from '../middleware/validation';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true }); // To access menuId from parent router

// All routes require authentication
router.use(requireAuth);

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


