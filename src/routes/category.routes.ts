import express from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Category routes
router.get('/menus/:menuId/categories', getCategories);
router.get('/menus/:menuId/categories/:categoryId', getCategoryById);
router.post('/menus/:menuId/categories', createCategory);
router.put('/menus/:menuId/categories/:categoryId', updateCategory);
router.delete('/menus/:menuId/categories/:categoryId', deleteCategory);

export default router;

