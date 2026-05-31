import { Request, Response } from 'express';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { getImageUrl } from '../utils/urlHelper';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';
import { uploadMemoryStorage } from './upload.controller';

export { uploadMemoryStorage };

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const UPLOAD_SUBDIR = 'structure';

export async function uploadStructureImage(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = files?.[0] ?? req.file;

    if (!file) {
      sendApiError(res, req, 400, ApiErrors.noFileUploaded);
      return;
    }

    const fileType = await fileTypeFromBuffer(file.buffer);

    if (!fileType || !ALLOWED_TYPES.includes(fileType.mime)) {
      sendApiError(res, req, 400, ApiErrors.invalidFileTypeDetected);
      return;
    }

    const uploadDir = path.join(process.cwd(), 'uploads', UPLOAD_SUBDIR);
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `${uuidv4()}.webp`;
    const filePath = path.join(uploadDir, filename);

    await sharp(file.buffer)
      .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(filePath);

    const imageUrl = getImageUrl(`/uploads/${UPLOAD_SUBDIR}/${filename}`)!;

    logger.info(`Structure image uploaded: ${imageUrl}`);

    res.json({ image: imageUrl });
  } catch (error) {
    logger.error('Upload structure image error:', error);
    sendApiError(res, req, 500, ApiErrors.failedUploadImage);
  }
}
