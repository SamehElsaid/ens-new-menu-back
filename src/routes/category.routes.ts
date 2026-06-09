import express from 'express';
import { body } from 'express-validator';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  bulkImportCategories,
  checkBulkImportCanUse,
} from '../controllers/category.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { resolveMenuParam } from '../middleware/resolveMenuIdentifier.middleware';
import { validate } from '../middleware/validation';

const router = express.Router();

router.param('menuId', resolveMenuParam);

// All routes require authentication
router.use(requireAuth);

// Category routes
router.get('/menus/:menuId/categories', getCategories);
router.post(
  '/menus/:menuId/categories/bulk',
  validate([
    body().custom((_, { req }) => {
      const categories = Array.isArray(req.body)
        ? req.body
        : req.body?.categories;
      if (!Array.isArray(categories) || categories.length === 0) {
        throw new Error('categories array is required');
      }
      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        if (!cat?.nameAr?.trim?.() || !cat?.nameEn?.trim?.()) {
          throw new Error(`Category at index ${i} must have nameAr and nameEn`);
        }
        if (cat.items !== undefined && !Array.isArray(cat.items)) {
          throw new Error(`Category at index ${i}: items must be an array`);
        }
        const items = cat.items ?? [];
        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          if (!item?.nameAr?.trim?.() || !item?.nameEn?.trim?.()) {
            throw new Error(
              `Item at category index ${i}, item index ${j} must have nameAr and nameEn`,
            );
          }
          if (
            item.descriptionAr !== undefined &&
            item.descriptionAr !== null &&
            typeof item.descriptionAr !== 'string'
          ) {
            throw new Error(
              `Item at category index ${i}, item index ${j}: descriptionAr must be a string`,
            );
          }
          if (
            item.descriptionEn !== undefined &&
            item.descriptionEn !== null &&
            typeof item.descriptionEn !== 'string'
          ) {
            throw new Error(
              `Item at category index ${i}, item index ${j}: descriptionEn must be a string`,
            );
          }
          const hasDirectPrice =
            item.price !== null &&
            item.price !== undefined &&
            !Number.isNaN(Number(item.price)) &&
            Number(item.price) >= 0;
          const hasVariantPrices =
            Array.isArray(item.variants) &&
            item.variants.some(
              (variant: { price?: unknown }) =>
                variant?.price !== null &&
                variant?.price !== undefined &&
                !Number.isNaN(Number(variant.price)) &&
                Number(variant.price) >= 0,
            );
          if (!hasDirectPrice && !hasVariantPrices) {
            throw new Error(
              `Item at category index ${i}, item index ${j} must have a valid price or variants with prices`,
            );
          }
        }
      }
      return true;
    }),
  ]),
  bulkImportCategories,
);
router.get(
  '/menus/:menuId/categories/bulk/canuse',
  checkBulkImportCanUse,
);
router.get('/menus/:menuId/categories/:categoryId', getCategoryById);
router.post('/menus/:menuId/categories', createCategory);
router.put('/menus/:menuId/categories/:categoryId', updateCategory);
router.delete('/menus/:menuId/categories/:categoryId', deleteCategory);

export default router;

