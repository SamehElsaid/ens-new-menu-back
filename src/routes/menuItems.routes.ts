import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
} from '../controllers/menuItems.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Menu items routes
router.get('/:menuId/items', getMenuItems);
router.get('/:menuId/items/:itemId', getMenuItem);
router.post('/:menuId/items', createMenuItem);
router.put('/:menuId/items/:itemId', updateMenuItem);
router.delete('/:menuId/items/:itemId', deleteMenuItem);

export default router;

