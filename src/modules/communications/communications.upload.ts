import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { env } from '../../config/env';

// Mirrors src/middleware/upload.ts's `uploadCommunicationAttachments`
// (upload.array('attachments', 5)) exactly (same storage/fileFilter/limits/
// field name) - that file is still used by the old Express stack and must
// not be edited, so the equivalent multer options are reproduced here for
// the Nest FilesInterceptor.
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const DOCUMENT_FIELDS = env.COMMUNICATIONS_DOCUMENT_FIELDS.split(',').map((field) => field.trim());

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
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const fileFilter: MulterOptions['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, Excel, CSV, and documents are allowed.'), false);
  }
};

export const communicationAttachmentsMulterOptions: MulterOptions = {
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
};

export const ATTACHMENTS_FIELD = 'attachments';
export const MAX_ATTACHMENTS = 5;
