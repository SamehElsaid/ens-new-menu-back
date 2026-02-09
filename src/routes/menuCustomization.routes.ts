import { Router } from 'express';
import { param } from 'express-validator';
import * as customizationController from '../controllers/menuCustomization.controller';
import { validate } from '../middleware/validation';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(requireAuth);

// GET /api/menus/:menuId/customizations - Get menu customizations
router.get(
  '/',
  [param('menuId').isInt()],
  customizationController.getCustomizations
);

// PUT /api/menus/:menuId/customizations - Update customizations (Pro only)
router.put(
  '/',
  validate([
    param('menuId').isInt(),
    // All fields are optional for partial updates
  ]),
  customizationController.updateCustomizations
);

// DELETE /api/menus/:menuId/customizations - Reset to default
router.delete(
  '/',
  [param('menuId').isInt()],
  customizationController.resetCustomizations
);

export default router;

