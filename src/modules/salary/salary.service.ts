import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { SalaryModel } from './Salary';
import { EmployeeModel } from '../../employees/Employee';
import { JwtPayload, SalaryStatus, UserRole } from '../../types';
import pool from '../../config/database';
import { generateSalarySlipPDF as generatePDF } from '../../utils/pdfGenerator';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { sendPayslipAvailableEmail } from '../../config/email';
import { isSecureBucketConfigured, uploadPrivateObject } from '../../lib/storage/gcsStorage';
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto';
import { GenerateSalaryDto } from './dto/generate-salary.dto';
import { UpdateSalaryStatusDto } from './dto/update-salary-status.dto';

// OCD-574: roles allowed to open salary slips that belong to other employees.
// Everyone else (Finance included) only ever sees their own slips.
const PAYROLL_ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];
// OCD-581: Finance Manager runs the salary bulk upload alongside HR.

const isPayrollAdmin = (role: UserRole) => PAYROLL_ADMIN_ROLES.includes(role);

@Injectable()
export class SalaryService {
  getComponents() {
    return SalaryModel.getComponents();
  }

  private async resolveEmployeeId(userId: number): Promise<string> {
    const employee = await EmployeeModel.findById(userId);
    if (!employee?.employeeId) {
      throw new BadRequestException('This user has no employee ID assigned yet');
    }
    return employee.employeeId;
  }

  // OCD-574: a slip is readable by its owner or a payroll admin only.
  private assertCanAccessSalary(salary: { employee_id: string }, requester: JwtPayload) {
    if (salary.employee_id !== requester.employeeId && !isPayrollAdmin(requester.role)) {
      throw new ForbiddenException('Forbidden');
    }
  }

  // OCD-574 / OCD-575: header details for the slip owner (never the logged-in
  // user), including the bank block.
  private async getSlipEmployee(employeeId: string) {
    const employee = await EmployeeModel.findByEmployeeId(employeeId);
    if (!employee) throw new NotFoundException('User not found');
    return {
      employee_id: employee.employeeId ?? undefined,
      first_name: employee.firstName,
      last_name: employee.lastName,
      position: employee.position ?? undefined,
      bank_name: employee.bankName ?? undefined,
      bank_branch: employee.bankBranch ?? undefined,
      account_number: employee.accountNumber ?? undefined,
    };
  }

  async getEmployeeSalaryStructure(userId: number, requester: JwtPayload) {
    if (requester.role === UserRole.EMPLOYEE && userId !== requester.userId) {
      throw new ForbiddenException('Forbidden');
    }
    const employeeId = await this.resolveEmployeeId(userId);
    return SalaryModel.getEmployeeSalaryStructure(employeeId);
  }

  async updateSalaryStructure(userId: number, dto: UpdateSalaryStructureDto, requester: JwtPayload) {
    if (requester.role !== UserRole.HR_MANAGER && requester.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only HR Manager can update salary structure');
    }
    const employeeId = await this.resolveEmployeeId(userId);
    await SalaryModel.updateSalaryStructure(employeeId, dto.components);
  }

  async generateSalary(dto: GenerateSalaryDto, requester: JwtPayload) {
    if (
      requester.role !== UserRole.HR_MANAGER &&
      requester.role !== UserRole.HR_EXECUTIVE &&
      requester.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only HR can generate salaries');
    }

    const userId = parseInt(String(dto.userId));
    const { month, year } = dto;
    if (!userId || !month || !year) {
      throw new BadRequestException('User ID, month, and year are required');
    }

    const monthYear = new Date(year, month - 1, 1);
    const employeeId = await this.resolveEmployeeId(userId);

    const existing = await SalaryModel.findByEmployeeId(employeeId, { year, month });
    if (existing.length > 0) {
      throw new BadRequestException('Salary for this month already exists');
    }

    const salary = await SalaryModel.generateSalary(employeeId, monthYear, requester.userId);

    // Send payslip notification email to employee (non-blocking, fire-and-forget).
    this.sendPayslipEmail(userId, monthYear, salary).catch((emailErr) => {
      logger.error({ err: emailErr }, 'Failed to send payslip email');
    });

    return salary;
  }

  private async sendPayslipEmail(userId: number, monthYear: Date, salary: any) {
    const employeeUser = await EmployeeModel.findById(userId);
    if (!employeeUser?.email) return;
    const payPeriod = monthYear.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
    await sendPayslipAvailableEmail(employeeUser.email, {
      employeeName: `${employeeUser.firstName} ${employeeUser.lastName}`.trim(),
      payPeriod,
      netSalary: `${parseFloat(String(salary.net_salary)).toLocaleString()}`,
      grossEarnings: `${parseFloat(String(salary.total_earnings)).toLocaleString()}`,
      totalDeductions: `${parseFloat(String(salary.total_deductions)).toLocaleString()}`,
      downloadUrl: `${env.FRONTEND_URL ?? 'https://oxo-carriers-frontend-297614602590.us-central1.run.app'}/salaries`,
    });
  }

  async getSalaries(
    requester: JwtPayload,
    filters: { userId?: string; department?: string; year?: string; month?: string; status?: string; scope?: string },
  ) {
    // OCD-574: the Salary page shows the caller's own slips. Only payroll
    // admins can widen that (userId/department filter or scope=all, used by
    // Reports); for everyone else those filters are ignored.
    const wantsOthers = !!(filters.userId || filters.department || filters.scope === 'all');
    if (!wantsOthers || !isPayrollAdmin(requester.role)) {
      if (!requester.employeeId) {
        throw new BadRequestException('Your account has no employee ID assigned yet');
      }
      return SalaryModel.findByEmployeeId(requester.employeeId, {
        year: filters.year ? parseInt(filters.year) : undefined,
        month: filters.month ? parseInt(filters.month) : undefined,
      });
    }
    const employeeId = filters.userId ? await this.resolveEmployeeId(parseInt(filters.userId)) : undefined;
    return SalaryModel.getAll({
      employeeId,
      department: filters.department,
      year: filters.year ? parseInt(filters.year) : undefined,
      month: filters.month ? parseInt(filters.month) : undefined,
      status: filters.status as SalaryStatus,
    });
  }

  async getSalaryById(id: number, requester: JwtPayload) {
    const salary = await SalaryModel.findById(id);
    if (!salary) throw new NotFoundException('Salary not found');
    this.assertCanAccessSalary(salary, requester);
    const details = await SalaryModel.getSlipDetails(id);
    const employee = await this.getSlipEmployee(salary.employee_id);
    return { salary, details, employee };
  }

  async generateSalarySlipPdf(id: number, requester: JwtPayload): Promise<Buffer> {
    const salary = await SalaryModel.findById(id);
    if (!salary) throw new NotFoundException('Salary not found');
    this.assertCanAccessSalary(salary, requester);

    const details = await SalaryModel.getSlipDetails(id);
    const user = await this.getSlipEmployee(salary.employee_id);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generatePDF({ salary, details, user });
    } catch (error: any) {
      logger.error({ err: error }, 'PDF generation failed');
      throw new BadRequestException('Failed to generate PDF');
    }

    // Persisted only to a private bucket, never to local disk - salary PDFs
    // are payroll-sensitive and this app has no public static mount to serve
    // them from anyway. `pdf_url` stores the bucket object key, not a URL;
    // this endpoint always streams a freshly generated buffer regardless, so
    // skipping persistence when no bucket is configured is safe.
    if (!salary.pdf_url && isSecureBucketConfigured()) {
      try {
        const objectKey = `salary-slips/salary-slip-${salary.id}-${randomUUID()}.pdf`;
        await uploadPrivateObject(objectKey, pdfBuffer, 'application/pdf');
        await SalaryModel.updatePdfUrl(id, objectKey);
      } catch (saveError: any) {
        logger.error({ err: saveError }, 'Failed to save PDF to secure storage');
        // Continue to send the buffer even if saving fails.
      }
    }

    return pdfBuffer;
  }

  async updateSalaryStatus(id: number, dto: UpdateSalaryStatusDto, requester: JwtPayload) {
    if (
      requester.role !== UserRole.HR_MANAGER &&
      requester.role !== UserRole.HR_EXECUTIVE &&
      requester.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only HR can update salary status');
    }
    if (!dto.status) {
      throw new BadRequestException('Status is required');
    }

    const updated = await SalaryModel.updateStatus(id, dto.status, dto.paid_date ? new Date(dto.paid_date) : undefined);

    if (dto.status === SalaryStatus.PAID && updated) {
      this.sendPaidEmail(updated).catch((emailErr) => {
        logger.error({ err: emailErr }, 'Failed to send payslip paid email');
      });
    }

    return updated;
  }

  private async sendPaidEmail(updated: any) {
    const employeeUser = await EmployeeModel.findByEmployeeId(updated.employee_id);
    if (!employeeUser?.email) return;
    const payPeriod = new Date(updated.month_year).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
    await sendPayslipAvailableEmail(employeeUser.email, {
      employeeName: `${employeeUser.firstName} ${employeeUser.lastName}`.trim(),
      payPeriod,
      netSalary: `${parseFloat(String(updated.net_salary)).toLocaleString()}`,
      grossEarnings: `${parseFloat(String(updated.total_earnings)).toLocaleString()}`,
      totalDeductions: `${parseFloat(String(updated.total_deductions)).toLocaleString()}`,
      downloadUrl: `${env.FRONTEND_URL ?? 'https://oxo-carriers-frontend-297614602590.us-central1.run.app'}/salaries`,
    });
  }

  async getYearToDateEarnings(requester: JwtPayload, yearParam?: string) {
    const currentYear = yearParam ? parseInt(yearParam) : new Date().getFullYear();
    if (!requester.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    const salaries = await SalaryModel.findByEmployeeId(requester.employeeId, { year: currentYear });

    const totalEarnings = salaries.reduce((sum, salary) => sum + parseFloat(salary.total_earnings.toString()), 0);
    const totalDeductions = salaries.reduce((sum, salary) => sum + parseFloat(salary.total_deductions.toString()), 0);
    const totalNet = salaries.reduce((sum, salary) => sum + parseFloat(salary.net_salary.toString()), 0);

    return { year: currentYear, totalEarnings, totalDeductions, totalNet, salaryCount: salaries.length };
  }

  async generateBulkUploadTemplate(): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Salary Upload Template');
    worksheet.columns = [
      { header: 'id', key: 'id', width: 10 },
      { header: 'name', key: 'name', width: 25 },
      { header: 'Local Salary', key: 'localSalary', width: 15 },
      { header: 'OXO International Salary', key: 'oxoSalary', width: 22 },
      { header: 'Working Days', key: 'workingDays', width: 22 },
      { header: 'EPF 8%', key: 'epf', width: 12 },
      { header: 'Allowances', key: 'allowances', width: 14 },
      { header: 'Salary Advance/Deductions', key: 'deductions', width: 20 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({
      id: 101,
      name: 'John Doe',
      localSalary: 150000,
      oxoSalary: 50000,
      workingDays: '30, 2, 28',
      epf: 12000,
      allowances: 5000,
      deductions: 0,
    });
    return workbook.xlsx.writeBuffer();
  }

  async uploadBulkSalaries(
    filePath: string,
    dto: BulkUploadSalaryDtoLike,
    requester: JwtPayload,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    // Access is enforced by PermissionGuard (salary_bulk_upload:write) on the controller.
    if (!dto.month || !dto.year) {
      throw new BadRequestException('Month and year are required');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new BadRequestException('Invalid Excel file format');
    }

    const monthYear = new Date(parseInt(dto.year), parseInt(dto.month) - 1, 1);
    const generatedBy = requester.userId;

    let headerRow = 1;
    let idCol = 0,
      nameCol = 0,
      fullSalaryCol = 0,
      localSalaryCol = 0,
      oxoSalaryCol = 0,
      workingDaysCol = 0,
      epfCol = 0,
      allowancesCol = 0,
      deductionsCol = 0;

    for (let rowNum = 1; rowNum <= 10; rowNum++) {
      const row = worksheet.getRow(rowNum);
      let foundHeaders = 0;
      // Column indices must reset per candidate row - otherwise a stray match on an
      // earlier row (e.g. a title/instructions row) poisons detection for the real
      // header row, since each `col === 0` guard below would already be false.
      idCol = 0;
      nameCol = 0;
      fullSalaryCol = 0;
      localSalaryCol = 0;
      oxoSalaryCol = 0;
      workingDaysCol = 0;
      epfCol = 0;
      allowancesCol = 0;
      deductionsCol = 0;

      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellValue = cell.value?.toString().toLowerCase().trim() || '';

        if ((cellValue === 'id' || cellValue.includes('user id') || cellValue.includes('user_id')) && idCol === 0) {
          idCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue === 'name' || cellValue.includes('employee name') || cellValue.includes('full name')) &&
          nameCol === 0
        ) {
          nameCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue.includes('full salary') || cellValue.includes('full_salary') || cellValue === 'full') &&
          fullSalaryCol === 0
        ) {
          fullSalaryCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue.includes('local salary') || cellValue.includes('local_salary') || cellValue === 'local') &&
          localSalaryCol === 0
        ) {
          localSalaryCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue.includes('oxo international salary') ||
            cellValue.includes('oxo_international_salary') ||
            cellValue.includes('oxo int') ||
            cellValue.includes('international salary') ||
            cellValue.includes('oxo international') ||
            cellValue === 'oxo international salary') &&
          oxoSalaryCol === 0
        ) {
          oxoSalaryCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue.includes('working days') ||
            cellValue.includes('working_days') ||
            cellValue.includes('worked days') ||
            cellValue.includes('worked_days') ||
            cellValue.includes('work days') ||
            cellValue === 'days') &&
          workingDaysCol === 0
        ) {
          workingDaysCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue.includes('epf') ||
            cellValue.includes('8%') ||
            cellValue.includes('employee deduction') ||
            cellValue.includes('provident fund')) &&
          epfCol === 0
        ) {
          epfCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue.includes('allowances') || cellValue.includes('allowance') || cellValue.includes('bonus')) &&
          allowancesCol === 0
        ) {
          allowancesCol = colNumber;
          foundHeaders++;
        } else if (
          (cellValue.includes('salary advance') ||
            cellValue.includes('deductions') ||
            cellValue.includes('salary deduction') ||
            cellValue.includes('advance')) &&
          deductionsCol === 0
        ) {
          deductionsCol = colNumber;
          foundHeaders++;
        }
      });

      if (foundHeaders >= 3) {
        headerRow = rowNum;
        break;
      }
    }

    const missingColumns: string[] = [];
    if (idCol === 0) missingColumns.push('id');
    if (localSalaryCol === 0) missingColumns.push('Local Salary');
    if (oxoSalaryCol === 0) missingColumns.push('OXO International Salary');

    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Invalid Excel format. Missing required columns: ${missingColumns.join(', ')}. Found columns: ${
          idCol > 0 ? 'id' : ''
        } ${fullSalaryCol > 0 ? 'Full Salary' : ''} ${localSalaryCol > 0 ? 'Local Salary' : ''} ${
          oxoSalaryCol > 0 ? 'OXO International Salary' : ''
        } ${workingDaysCol > 0 ? 'Working Days' : ''} ${epfCol > 0 ? 'EPF' : ''}`,
      );
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (let rowNum = headerRow + 1; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);

      try {
        const idValue = row.getCell(idCol).value?.toString().trim();
        if (!idValue || idValue === '') continue;

        // Skip a stray repeated header row (e.g. a frozen/duplicated header
        // pasted into the data area) instead of reporting it as an invalid ID.
        if (idValue.toLowerCase() === 'id' || (nameCol > 0 && row.getCell(nameCol).value?.toString().trim().toLowerCase() === 'name')) {
          continue;
        }

        // OCD-580: validate the row before touching the DB - every failing
        // field is reported with its row and column so the sheet can be fixed.
        const fieldErrors: string[] = [];

        if (nameCol > 0 && !cellText(row.getCell(nameCol))) {
          fieldErrors.push('Name is required');
        }

        const readAmount = (col: number, label: string, required: boolean): number => {
          if (col === 0) return 0;
          const raw = cellText(row.getCell(col));
          if (!raw) {
            if (required) fieldErrors.push(`${label} is required`);
            return 0;
          }
          const cleaned = raw.replace(/[,\s$₹€£]|LKR/gi, '');
          if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
            fieldErrors.push(`${label} must be a number (found "${raw}")`);
            return 0;
          }
          const amount = parseFloat(cleaned);
          if (amount < 0) fieldErrors.push(`${label} cannot be negative`);
          return amount;
        };

        const localSalary = readAmount(localSalaryCol, 'Local Salary', true);
        const oxoSalary = readAmount(oxoSalaryCol, 'OXO International Salary', true);
        const epfDeduction = readAmount(epfCol, 'EPF 8%', false);
        const allowances = readAmount(allowancesCol, 'Allowances', false);
        const salaryAdvanceDeductions = readAmount(deductionsCol, 'Salary Advance/Deductions', false);

        if (fieldErrors.length > 0) {
          results.failed++;
          results.errors.push(`Row ${rowNum}: ${fieldErrors.join('; ')}`);
          continue;
        }

        let userId: number | null = null;
        const parsedId = parseInt(idValue);

        if (!isNaN(parsedId)) {
          userId = parsedId;
        } else {
          const empResult = await pool.query('SELECT id FROM tbl_employee WHERE employee_id = $1', [idValue]);
          const empUsers = empResult.rows as any[];
          if (empUsers.length > 0) {
            userId = empUsers[0].id;
          }
        }

        if (!userId || isNaN(userId)) {
          results.failed++;
          results.errors.push(`Row ${rowNum}: Invalid ID "${idValue}" - not found in system`);
          continue;
        }

        const userResult2 = await pool.query('SELECT id, employee_id FROM tbl_employee WHERE id = $1', [userId]);
        const usersFound = userResult2.rows as any[];
        if (usersFound.length === 0 || !usersFound[0].employee_id) {
          results.failed++;
          results.errors.push(`Row ${rowNum}: User with ID ${userId} not found or has no employee ID`);
          continue;
        }
        const employeeId: string = usersFound[0].employee_id;

        // Full Salary = Local + OXO International + Allowances (OCD-573).
        const fullSalary = localSalary + oxoSalary + allowances;

        let workedDays = 0,
          availableDates = 0,
          leaves = 0;

        if (workingDaysCol > 0) {
          const workingDaysCell = row.getCell(workingDaysCol);
          const workingDaysValue = workingDaysCell?.value?.toString().trim() || '';

          if (workingDaysValue.includes(',')) {
            const parts = workingDaysValue.split(',').map((p) => p.trim());
            if (parts.length >= 3) {
              availableDates = parseFloat(parts[0].replace(/[^\d.]/g, '')) || 0;
              leaves = parseFloat(parts[1].replace(/[^\d.]/g, '')) || 0;
              workedDays = parseFloat(parts[2].replace(/[^\d.]/g, '')) || 0;
            } else if (parts.length === 2) {
              leaves = parseFloat(parts[0].replace(/[^\d.]/g, '')) || 0;
              workedDays = parseFloat(parts[1].replace(/[^\d.]/g, '')) || 0;
            } else {
              workedDays = parseFloat(parts[0].replace(/[^\d.]/g, '')) || 0;
            }
          } else {
            workedDays = parseFloat(workingDaysValue.replace(/[^\d.]/g, '')) || 0;
          }
        }

        await SalaryModel.createSalaryFromExcel(
          employeeId,
          monthYear,
          {
            fullSalary,
            localSalary,
            oxoInternationalSalary: oxoSalary,
            workedDays,
            availableDates,
            leaves,
            epfDeduction,
            allowances,
            salaryAdvanceDeductions,
          },
          generatedBy,
        );

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: ${error.message}`);
        logger.error({ err: error, rowNum }, 'Error processing row');
      }
    }

    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      logger.error({ err: error }, 'Error deleting uploaded file');
    }

    return results;
  }
}

// Text of an Excel cell, unwrapping formula results / rich text; '' when empty.
function cellText(cell: ExcelJS.Cell): string {
  const value = cell?.value as any;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    if ('result' in value) return String(value.result ?? '').trim();
    if ('richText' in value) return value.richText.map((t: any) => t.text).join('').trim();
    if ('text' in value) return String(value.text ?? '').trim();
  }
  return String(value).trim();
}

interface BulkUploadSalaryDtoLike {
  month: string;
  year: string;
}
