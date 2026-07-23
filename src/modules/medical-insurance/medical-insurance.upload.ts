import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Mirrors src/middleware/upload.ts's `uploadMedicalDocuments` exactly (same
// storage/fileFilter/limits/field names) - that file is still used by the
// old Express stack and must not be edited, so the equivalent multer options
// are reproduced here for the Nest FileFieldsInterceptor.
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const docFields = ['document', 'supportive_document', 'relevant_document', 'log_sheet', 'invoice'];
    const subDir = docFields.includes(file.fieldname) ? 'documents' : 'others';
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
  const allowedMimes = [
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

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, Excel, CSV, and documents are allowed.'), false);
  }
};

export const medicalDocumentsMulterOptions: MulterOptions = {
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
};

export const MEDICAL_DOCUMENT_FIELDS = [
  { name: 'supportive_document', maxCount: 1 },
  { name: 'relevant_document', maxCount: 1 },
];
