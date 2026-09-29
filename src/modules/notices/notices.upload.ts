import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// OCD-570: notices previously just re-exported the shared
// documentUploadMulterOptions (see ../../common/upload/document-upload.options.ts),
// which also allows PDFs/Word/Excel/CSV/zip - far too permissive for a field
// that's supposed to be an image only (a .xlsx was being accepted as a
// "notice image"). Given its own dedicated config instead, following the
// same override pattern already used by communications.upload.ts (its own
// ALLOWED_MIME_TYPES array instead of re-exporting the shared one) and
// profile-picture.upload.ts. Storage/filename convention mirrors
// document-upload.options.ts's (random UUID name, owner-only directory)
// since notices.service.ts still writes images under uploads/others.
const RESTRICTED_DIR_MODE = 0o700;

const uploadsDir = path.join(process.cwd(), 'uploads', 'others');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true, mode: RESTRICTED_DIR_MODE });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter: MulterOptions['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  // Thrown as a NestJS HttpException (not a plain Error) so it comes back
  // out of @nestjs/platform-express's multer transformException() unchanged
  // (that function only special-cases HttpException instances and a fixed
  // list of multer's own error messages - anything else falls through as a
  // generic Error, which AllExceptionsFilter has no branch for and would
  // surface as a 500) and lands on AllExceptionsFilter's existing
  // `instanceof HttpException` branch as a clean 400, with no changes
  // needed to that shared filter.
  cb(
    new BadRequestException('Unsupported file type. Only JPG, PNG, and GIF images are allowed for the notice image.'),
    false,
  );
};

export const noticeImageMulterOptions: MulterOptions = {
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
};

export const NOTICE_IMAGE_FIELD = 'image';
