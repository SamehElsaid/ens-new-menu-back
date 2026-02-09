import { Router } from 'express';
import { query, param, body } from 'express-validator';
import * as uploadController from '../controllers/upload.controller';
import { uploadMemoryStorage } from '../controllers/upload.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { uploadLimiter } from '../middleware/rateLimiter';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// POST /api/upload - Upload image
router.post(
  '/',
  uploadLimiter,
  uploadMemoryStorage.single('file'),
  [body('type').optional().isIn(['logos', 'menu-items', 'ads', 'profile-images'])],
  uploadController.uploadImage
);

// DELETE /api/upload/:filename - Delete image
router.delete(
  '/:filename',
  [
    param('filename').notEmpty().matches(/^[a-f0-9-]+\.webp$/),
    query('type').optional().isIn(['logos', 'menu-items', 'ads']),
  ],
  uploadController.deleteImage
);

// GET /api/upload/:filename/info - Get image info
router.get(
  '/:filename/info',
  [
    param('filename').notEmpty().matches(/^[a-f0-9-]+\.webp$/),
    query('type').optional().isIn(['logos', 'menu-items', 'ads']),
  ],
  uploadController.getImageInfo
);

export default router;


