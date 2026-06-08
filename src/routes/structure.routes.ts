import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { uploadMemoryStorage, uploadStructureImage } from '../controllers/structure.controller';

const router = Router();

router.use(requireAuth);

// POST /api/structure/image/
router.post(
  '/image/',
  uploadMemoryStorage.any(),
  uploadStructureImage,
);

export default router;
