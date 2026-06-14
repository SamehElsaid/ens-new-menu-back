import { Router } from 'express';
import { body, query, param } from 'express-validator';
import * as menuItemController from '../controllers/menuItem.controller';
import { validate } from '../middleware/validation';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true }); // To access menuId from parent router

// All routes require authentication
router.use(requireAuth);

// GET /api/menus/:menuId/items - Get menu items (pagination + search)
router.get(
  '/',
  [
    param('menuId').isInt(),
    query('locale').optional().isIn(['ar', 'en']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim().isLength({ max: 255 }),
    query('categoryId').optional().isInt({ min: 1 }).toInt(),
    query('category').optional().isString().trim().isLength({ max: 255 }),
    query('available').optional().isIn(['true', 'false']),
  ],
  menuItemController.getMenuItems
);

// GET /api/menus/:menuId/items/:itemId - Get single menu item
router.get(
  '/:itemId',
  [
    param('menuId').isInt(),
    param('itemId').isInt(),
    query('locale').optional().isIn(['ar', 'en']),
  ],
  menuItemController.getMenuItem
);

// POST /api/menus/:menuId/items - Create menu item
router.post(
  '/',
  validate([
    param('menuId').isInt(),
    body('nameAr').notEmpty().trim().isLength({ max: 255 }),
    body('nameEn').notEmpty().trim().isLength({ max: 255 }),
    body('descriptionAr').optional().isString().trim().isLength({ max: 2000 }),
    body('descriptionEn').optional().isString().trim().isLength({ max: 2000 }),
    body('categoryId').optional().isInt(),
    body('category').optional().trim().isLength({ max: 100 }),
    body().custom((value) => {
      // At least one of categoryId or category must be provided
      if (!value.categoryId && (!value.category || value.category.trim() === '')) {
        throw new Error('Either categoryId or category must be provided');
      }
      return true;
    }),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a valid number and greater than or equal to 0'),
    body('originalPrice').optional().isFloat({ min: 0 }),
    body('discountPercent').optional().isInt({ min: 0, max: 100 }),
    body('image').optional().isString().isLength({ max: 500 }),
    body('isAvailable').optional().isBoolean(),
    body('available').optional().isBoolean(),
    body('sortOrder').optional().isInt(),
  ]),
  menuItemController.createMenuItem
);

// PUT /api/menus/:menuId/items/:itemId - Update menu item
router.put(
  '/:itemId',
  validate([
    param('menuId').isInt(),
    param('itemId').isInt(),
    body('nameAr').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 255 }),
    body('nameEn').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 255 }),
    body('descriptionAr').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 2000 }),
    body('descriptionEn').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 2000 }),
    body('categoryId').optional().isInt({ min: 1 }).toInt(),
    body('category').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
    body('price').optional().isFloat({ min: 0 }),
    body('image').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 }),
    body('isAvailable').optional().isBoolean(),
    body('sortOrder').optional().isInt(),
  ]),
  menuItemController.updateMenuItem
);

// DELETE /api/menus/:menuId/items/:itemId - Delete menu item
router.delete(
  '/:itemId',
  [param('menuId').isInt(), param('itemId').isInt()],
  menuItemController.deleteMenuItem
);

// POST /api/menus/:menuId/items/reorder - Update display order
router.post(
  '/reorder',
  validate([
    param('menuId').isInt(),
    body('items').isArray(),
    body('items.*.id').isInt(),
    body('items.*.sortOrder').isInt(),
  ]),
  menuItemController.updateDisplayOrder
);

export default router;


