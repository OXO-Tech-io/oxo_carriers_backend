import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// OCD-454: dedicated multer config for the "My Profile" camera-icon upload -
// images only (unlike documentUploadMulterOptions, which also allows PDFs/
// Office docs), stored under its own uploads/profile-pictures subdirectory.
// Mirrors document-upload.options.ts's storage/fileFilter/limits shape.
const uploadsDir = path.join(process.cwd(), 'uploads', 'profile-pictures');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `profile-picture-${uniqueSuffix}${ext}`);
  },
});

const fileFilter: MulterOptions['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, GIF and WebP images are allowed.'), false);
  }
};

export const profilePictureMulterOptions: MulterOptions = {
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
};

export const PROFILE_PICTURE_FIELD = 'profilePicture';
