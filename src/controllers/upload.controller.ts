import { Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { getImageUrl } from '../utils/urlHelper';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Configure multer for memory storage
export const uploadMemoryStorage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    // For logos, check file size and type separately
    if (req.body.type === 'logos' && file.mimetype.includes('icon')) {
      // ICO files for logos - 1MB limit
      if (file.size > 1 * 1024 * 1024) {
        cb(new Error('Favicon file size must be less than 1MB.'));
        return;
      }
      cb(null, true);
    } else if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and ICO are allowed.'));
    }
  },
});

// Ensure upload directories exist
export async function ensureUploadDirectories(): Promise<void> {
  const dirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'uploads', 'logos'),
    path.join(process.cwd(), 'uploads', 'menu-items'),
    path.join(process.cwd(), 'uploads', 'ads'),
    path.join(process.cwd(), 'uploads', 'categories'),
    path.join(process.cwd(), 'uploads', 'profile-images'),
  ];

  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

// Upload and optimize image
export async function uploadImage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      sendApiError(res, req, 400, ApiErrors.noFileUploaded);
      return;
    }

    const { type = 'menu-items' } = req.body; // 'logos', 'menu-items', 'ads', 'categories', 'profile-images'
    const allowedTypes = ['logos', 'menu-items', 'ads', 'categories', 'profile-images'];

    if (!allowedTypes.includes(type)) {
      sendApiError(res, req, 400, ApiErrors.invalidUploadType);
      return;
    }

    // Verify file type using file-type library
    const fileType = await fileTypeFromBuffer(req.file.buffer);
    
    // Check if it's a favicon (ICO file)
    const isIcon = fileType?.mime === 'image/x-icon' || req.file.originalname.endsWith('.ico');
    
    if (!fileType && !isIcon) {
      sendApiError(res, req, 400, ApiErrors.invalidFileTypeDetected);
      return;
    }

    if (!isIcon && fileType && !ALLOWED_TYPES.includes(fileType.mime)) {
      sendApiError(res, req, 400, ApiErrors.invalidFileTypeDetected);
      return;
    }

    // For ICO files, only allow in logos type
    if (isIcon && type !== 'logos') {
      sendApiError(res, req, 400, ApiErrors.icoOnlyForLogos);
      return;
    }

    // Validate ICO file size (1MB max)
    if (isIcon && req.file.size > 1 * 1024 * 1024) {
      sendApiError(res, req, 400, ApiErrors.faviconMax1mb);
      return;
    }

    const uploadDir = path.join(process.cwd(), 'uploads', type);
    await fs.mkdir(uploadDir, { recursive: true });

    let filename: string;
    let filePath: string;
    let fileSize: number;
    let mimeType: string;

    // Handle ICO files differently (save as-is, no conversion)
    if (isIcon) {
      filename = `${uuidv4()}.ico`;
      filePath = path.join(uploadDir, filename);
      
      // Save ICO file as-is
      await fs.writeFile(filePath, req.file.buffer);
      const stats = await fs.stat(filePath);
      fileSize = stats.size;
      mimeType = 'image/x-icon';
    } else {
      // Handle regular images (convert to WebP)
      filename = `${uuidv4()}.webp`;
      filePath = path.join(uploadDir, filename);

      // Optimize and convert to WebP
      let sharpInstance = sharp(req.file.buffer);

      if (type === 'logos') {
        // Logos: 200x200, maintain aspect ratio
        sharpInstance = sharpInstance.resize(200, 200, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      } else if (type === 'menu-items') {
        // Menu items: max 800x800, maintain aspect ratio
        sharpInstance = sharpInstance.resize(800, 800, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      } else if (type === 'ads') {
        // Ads: max 1200x600, maintain aspect ratio
        sharpInstance = sharpInstance.resize(1200, 600, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      } else if (type === 'categories') {
        // Categories: 300x300, maintain aspect ratio
        sharpInstance = sharpInstance.resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      } else if (type === 'profile-images') {
        // Profile images: 400x400, maintain aspect ratio
        sharpInstance = sharpInstance.resize(400, 400, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert to WebP and save
      await sharpInstance
        .webp({ quality: 85 })
        .toFile(filePath);

      // Get file size
      const stats = await fs.stat(filePath);
      fileSize = stats.size;
      mimeType = 'image/webp';
    }

    // Return file URL - use helper for dynamic URL generation
    const relativePath = `/uploads/${type}/${filename}`;
    const fileUrl = getImageUrl(relativePath)!;

    logger.info(`File uploaded: ${fileUrl} (${fileSize} bytes, ${mimeType})`);

    res.json({
      message: 'File uploaded successfully',
      url: fileUrl,
      filename,
      size: fileSize,
      type: mimeType,
    });
  } catch (error) {
    logger.error('Upload image error:', error);
    sendApiError(res, req, 500, ApiErrors.failedUploadImage);
  }
}

// Delete image
export async function deleteImage(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const { type = 'menu-items' } = req.query;

    const allowedTypes = ['logos', 'menu-items', 'ads', 'categories', 'profile-images'];

    if (!allowedTypes.includes(type as string)) {
      sendApiError(res, req, 400, ApiErrors.invalidUploadType);
      return;
    }

    // Security: ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      sendApiError(res, req, 400, ApiErrors.invalidFilename);
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', type as string, filename);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      
      logger.info(`File deleted: ${filePath}`);
      
      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      sendApiError(res, req, 404, ApiErrors.fileNotFound);
    }
  } catch (error) {
    logger.error('Delete image error:', error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteImage);
  }
}

// Get image info (for verification)
export async function getImageInfo(req: Request, res: Response): Promise<void> {
  try {
    const { filename } = req.params;
    const { type = 'menu-items' } = req.query;

    const allowedTypes = ['logos', 'menu-items', 'ads', 'categories', 'profile-images'];

    if (!allowedTypes.includes(type as string)) {
      sendApiError(res, req, 400, ApiErrors.invalidUploadType);
      return;
    }

    // Security: ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      sendApiError(res, req, 400, ApiErrors.invalidFilename);
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', type as string, filename);

    try {
      const stats = await fs.stat(filePath);
      const metadata = await sharp(filePath).metadata();

      // Return full URL using helper
      const relativePath = `/uploads/${type}/${filename}`;
      
      res.json({
        filename,
        size: stats.size,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        createdAt: stats.birthtime,
        url: getImageUrl(relativePath),
      });
    } catch (error) {
      sendApiError(res, req, 404, ApiErrors.fileNotFound);
    }
  } catch (error) {
    logger.error('Get image info error:', error);
    sendApiError(res, req, 500, ApiErrors.failedGetImageInfo);
  }
}


