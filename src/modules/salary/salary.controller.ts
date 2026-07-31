import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { diskStorage } from 'multer';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { SalaryService } from './salary.service';
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto';
import { GenerateSalaryDto } from './dto/generate-salary.dto';
import { UpdateSalaryStatusDto } from './dto/update-salary-status.dto';
import { BulkUploadSalaryDto } from './dto/bulk-upload.dto';

// Matches middleware/upload.ts's `upload` multer instance exactly (same
// storage/fileFilter/limits), reused here rather than importing the Express
// middleware directly.
const uploadsDir = path.join(process.cwd(), 'uploads');
const storage = diskStorage({
  destination: (_req, file, cb) => {
    const docFields = ['document', 'supportive_document', 'relevant_document', 'log_sheet', 'invoice'];
    const subDir = docFields.includes(file.fieldname) ? 'documents' : 'others';
    const dir = path.join(uploadsDir, subDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
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
    cb(new Error('Invalid file type. Only images, PDFs, Excel, CSV, and documents are allowed.'));
  }
};

@Controller('salaries')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @Get('components')
  async getComponents() {
    const components = await this.salaryService.getComponents();
    return { success: true, components };
  }

  @Get('ytd')
  async getYtd(@CurrentEmployee() employee: JwtPayload, @Query('year') year?: string) {
    return { success: true, ...(await this.salaryService.getYearToDateEarnings(employee, year)) };
  }

  @Get()
  async getSalaries(
    @CurrentEmployee() employee: JwtPayload,
    @Query('userId') userId?: string,
    @Query('department') department?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    const salaries = await this.salaryService.getSalaries(employee, { userId, department, year, month, status });
    return { success: true, salaries };
  }

  @Get(':id')
  async getSalaryById(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() employee: JwtPayload) {
    const { salary, details } = await this.salaryService.getSalaryById(id, employee);
    return { success: true, salary, details };
  }

  @Get(':id/pdf')
  async getSalarySlipPdf(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() employee: JwtPayload, @Res() res: Response) {
    const pdfBuffer = await this.salaryService.generateSalarySlipPdf(id, employee);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="salary-slip-${id}.pdf"`);
    res.send(pdfBuffer);
  }

  @Get('structures/:userId')
  async getStructure(@Param('userId', ParseIntPipe) userId: number, @CurrentEmployee() employee: JwtPayload) {
    const structure = await this.salaryService.getEmployeeSalaryStructure(userId, employee);
    return { success: true, structure };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async generate(@Body() dto: GenerateSalaryDto, @CurrentEmployee() employee: JwtPayload) {
    const salary = await this.salaryService.generateSalary(dto, employee);
    return { success: true, message: 'Salary generated successfully', salary };
  }

  @Post('bulk-uploads')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  @UseInterceptors(FileInterceptor('excel', { storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }))
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: BulkUploadSalaryDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    const results = await this.salaryService.uploadBulkSalaries(file.path, dto, employee);
    return {
      success: true,
      message: `Processed ${results.success} salaries successfully${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      results: { success: results.success, failed: results.failed, errors: results.errors.slice(0, 10) },
    };
  }

  @Put('structures/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async updateStructure(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateSalaryStructureDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    await this.salaryService.updateSalaryStructure(userId, dto, employee);
    return { success: true, message: 'Salary structure updated successfully' };
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryStatusDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const salary = await this.salaryService.updateSalaryStatus(id, dto, employee);
    return { success: true, message: 'Salary status updated', salary };
  }
}
