import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Shared storage/fileFilter/limits for the "generic document or image
// upload, routed into uploads/documents vs uploads/others by field name"
// pattern that several modules' *.upload.ts files used to duplicate
// (consultant submissions, leaves, vouchers, medical insurance, work logs,
// forms, employee notes). Mirrors src/middleware/upload.ts, which is still
// used by the old Express stack and must not be edited.
//
// Directories are created owner-only (mode is a no-op on Windows but takes
// effect on the Linux hosts this runs on in production) since these uploads
// are only ever meant to be reached through an authenticated controller, not
// browsed directly on disk.
const RESTRICTED_DIR_MODE = 0o700;

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true, mode: RESTRICTED_DIR_MODE });
}

const DOCUMENT_FIELDS = ['document', 'supportive_document', 'relevant_document', 'log_sheet', 'invoice'];

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
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
  // Random, non-guessable name - the original filename and any
  // timestamp/sequence-derived name are discarded (only the extension is
  // kept) so stored files can't be enumerated or predicted from field name
  // and upload time.
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter: MulterOptions['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, Excel, CSV, and documents are allowed.'), false);
  }
};

export const documentUploadMulterOptions: MulterOptions = {
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
};
