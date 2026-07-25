import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Shared storage/fileFilter/limits for the "generic document or image
// upload, routed into uploads/documents vs uploads/others by field name"
// pattern that several modules' *.upload.ts files used to duplicate
// (consultant submissions, leaves, vouchers, medical insurance, work logs,
// forms, employee notes). Mirrors src/middleware/upload.ts, which is still
// used by the old Express stack and must not be edited.
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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

export const documentUploadMulterOptions: MulterOptions = {
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
};
