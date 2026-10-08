import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// OCD-495: Document Vault used to just re-export the shared, more permissive
// `documentUploadMulterOptions` (src/common/upload/document-upload.options.ts),
// which also allows GIF/XLS/XLSX/CSV/ZIP for the other modules that share it.
// This ticket's AC is narrower (JPG, PNG, PDF, DOC, DOCX only), so Document
// Vault now owns its own multer config instead - mirrors the pattern already
// used by src/modules/communications/communications.upload.ts, which also
// keeps its own separate ALLOWED_MIME_TYPES rather than sharing one.
//
// Directories are created owner-only (mode is a no-op on Windows but takes
// effect on the Linux hosts this runs on in production), same reasoning as
// the shared uploader this used to re-export.
const RESTRICTED_DIR_MODE = 0o700;

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true, mode: RESTRICTED_DIR_MODE });
}

export const ATTACHMENTS_FIELD = 'document';
export const ATTACHMENTS_MAX_COUNT = 5;

// 'document' is routed into uploads/documents/ (vs uploads/others/) - mirrors
// the DOCUMENT_FIELDS convention in the shared document-upload.options.ts.
const DOCUMENT_FIELDS = [ATTACHMENTS_FIELD];

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = DOCUMENT_FIELDS.includes(file.fieldname) ? 'documents' : 'others';
    const dir = path.join(uploadsDir, subDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: RESTRICTED_DIR_MODE });
    }
    cb(null, dir);
  },
  // Random, non-guessable name - the original filename is discarded (only
  // the extension is kept) so stored files can't be enumerated or predicted.
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// OCD-495: rejected via a NestJS BadRequestException (not a plain Error) so
// it surfaces as a clean 400 JSON response through the existing
// AllExceptionsFilter, rather than a 500. @nestjs/platform-express's
// FilesInterceptor (multer.utils.ts#transformException) only maps *known*
// multer/busboy error codes (LIMIT_FILE_SIZE etc.) to HttpExceptions and
// passes through any other Error unchanged; an `instanceof HttpException`
// error (which BadRequestException is) is explicitly left untouched by that
// same function, so it reaches AllExceptionsFilter's existing
// `instanceof HttpException` branch unchanged - no second parallel error
// mechanism needed here.
const fileFilter: MulterOptions['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Invalid file type. Only JPG, PNG, PDF, DOC, and DOCX files are allowed.'), false);
  }
};

export const documentVaultUploadMulterOptions: MulterOptions = {
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
};
