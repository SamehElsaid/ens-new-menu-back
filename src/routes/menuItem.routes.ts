import { Router } from 'express';
import { body, query, param } from 'express-validator';
import * as menuItemController from '../controllers/menuItem.controller';
import { validate } from '../middleware/validation';
import { requireAuth } from '../middleware/auth.middleware';
import {
  normalizeMenuItemSizesInput,
  resolveMenuItemBasePrice,
  validateMenuItemSizes,
} from '../utils/menuItemSizes';
import {
  normalizeMenuItemVariantsInput,
  validateMenuItemVariants,
} from '../utils/menuItemVariants';

const router = Router({ mergeParams: true }); // To access menuId from parent router

type MenuItemBody = {
  categoryId?: number;
  category?: string;
  price?: unknown;
  sizes?: unknown;
};

function assertSizesField(sizes: unknown): void {
  if (sizes === undefined || sizes === null) return;
  if (!Array.isArray(sizes)) {
    throw new Error('sizes must be an array');
  }
  if (sizes.length === 0) return;

  const normalized = normalizeMenuItemSizesInput(sizes);
  if (!normalized || normalized.length !== sizes.length) {
    throw new Error('Each size must have nameAr, nameEn, and price >= 0');
  }
  const sizeError = validateMenuItemSizes(normalized);
  if (sizeError) {
    throw new Error(sizeError);
  }
}

function assertVariantsField(variants: unknown): void {
  if (variants === undefined || variants === null) return;
  if (!Array.isArray(variants)) {
    throw new Error('variants must be an array');
  }
  if (variants.length === 0) return;

  const normalized = normalizeMenuItemVariantsInput(variants);
  if (!normalized || normalized.length !== variants.length) {
    throw new Error('Each add-on must have labelAr, labelEn, and price >= 0');
  }
  const variantError = validateMenuItemVariants(normalized);
  if (variantError) {
    throw new Error(variantError);
  }
}

function assertPriceOrSizes(value: MenuItemBody): void {
  const normalizedSizes =
    value.sizes !== undefined ? normalizeMenuItemSizesInput(value.sizes) : null;
  const resolvedPrice = resolveMenuItemBasePrice(value.price, normalizedSizes);
  if (resolvedPrice === null) {
    throw new Error('Price is required, or provide sizes with valid prices');
  }
}

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
    body().custom((value: MenuItemBody) => {
      // At least one of categoryId or category must be provided
      if (!value.categoryId && (!value.category || value.category.trim() === '')) {
        throw new Error('Either categoryId or category must be provided');
      }
      assertSizesField(value.sizes);
      assertVariantsField((value as { variants?: unknown }).variants);
      assertPriceOrSizes(value);
      return true;
    }),
    body('sizes').optional().isArray().withMessage('sizes must be an array'),
    body('sizes.*.nameAr').optional().trim().isLength({ max: 100 }),
    body('sizes.*.nameEn').optional().trim().isLength({ max: 100 }),
    body('sizes.*.price').optional().isFloat({ min: 0 }),
    body('variants').optional().isArray().withMessage('variants must be an array'),
    body('variants.*.labelAr').optional().trim().isLength({ max: 100 }),
    body('variants.*.labelEn').optional().trim().isLength({ max: 100 }),
    body('variants.*.price').optional().isFloat({ min: 0 }),
    body('price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Price must be a valid number and greater than or equal to 0'),
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
    body('sizes').optional().isArray().withMessage('sizes must be an array'),
    body('sizes.*.nameAr').optional().trim().isLength({ max: 100 }),
    body('sizes.*.nameEn').optional().trim().isLength({ max: 100 }),
    body('sizes.*.price').optional().isFloat({ min: 0 }),
    body('variants').optional().isArray().withMessage('variants must be an array'),
    body('variants.*.labelAr').optional().trim().isLength({ max: 100 }),
    body('variants.*.labelEn').optional().trim().isLength({ max: 100 }),
    body('variants.*.price').optional().isFloat({ min: 0 }),
    body().custom((value: MenuItemBody) => {
      assertSizesField(value.sizes);
      assertVariantsField((value as { variants?: unknown }).variants);
      if (value.sizes !== undefined || value.price !== undefined) {
        assertPriceOrSizes(value);
      }
      return true;
    }),
    body('price').optional().isFloat({ min: 0 }),
    body('originalPrice').optional().isFloat({ min: 0 }),
    body('discountPercent').optional().isInt({ min: 0, max: 100 }),
    body('available').optional().isBoolean(),
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


