import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import fs from 'fs';
import path from 'path';

// Replaces the old public `app.useStaticAssets('/uploads')` mount. Every
// route in this controller sits behind the global JwtAuthGuard (no
// @Public() here) - the only change from before is that a valid session is
// now required; per-file ownership is still whatever it was under the old
// static mount (none, beyond the module that produced the file already
// having gated who could obtain its URL).
const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

// documents/others: shared destination used by document-upload.options.ts
// and the *.upload.ts multer configs across communications, vouchers,
// leaves, notices, forms, work-logs, medical-insurance, employee-notes,
// consultant-submissions and document-vault.
const ALLOWED_CATEGORIES = new Set(['documents', 'others']);

// No path separators or traversal sequences - filenames in this tree are
// always either a multer-generated random name or a crypto.randomUUID().
const SAFE_FILENAME = /^[A-Za-z0-9_.-]+$/;

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
};

@Controller('files')
export class FilesController {
  @Get(':category/:filename')
  async download(@Param('category') category: string, @Param('filename') filename: string, @Res() res: Response) {
    // Salary slip PDFs are payroll-sensitive and are only ever served through
    // SalaryController's guarded, ownership-checked endpoint (which streams a
    // freshly generated buffer) - never through this generic pass-through.
    if (category === 'salary-slips') {
      throw new ForbiddenException('Forbidden');
    }
    if (!ALLOWED_CATEGORIES.has(category) || !SAFE_FILENAME.test(filename)) {
      throw new BadRequestException('Invalid file reference');
    }

    const categoryDir = path.resolve(UPLOADS_ROOT, category);
    const filePath = path.resolve(categoryDir, filename);
    if (filePath !== categoryDir && !filePath.startsWith(categoryDir + path.sep)) {
      throw new BadRequestException('Invalid file reference');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new NotFoundException('File not found');
    }

    const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  }
}
