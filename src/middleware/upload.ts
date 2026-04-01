import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure uploads directory exists
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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow images, PDFs, and documents
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
    'text/csv'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, Excel, CSV, and documents are allowed.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export const uploadDocument = upload.single('document');
export const uploadExcel = upload.single('excel');

export const uploadMedicalDocuments = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
}).fields([
  { name: 'supportive_document', maxCount: 1 },
  { name: 'relevant_document', maxCount: 1 }
]);

export const uploadConsultantLogSheet = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
}).single('log_sheet');

export const uploadVoucherInvoice = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
}).single('invoice');
