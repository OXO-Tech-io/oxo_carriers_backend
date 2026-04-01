import { Request, Response } from 'express';
import { SalaryModel } from '../models/Salary';
import { UserRole, SalaryStatus } from '../types';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { generateSalarySlipPDF as generatePDF } from '../utils/pdfGenerator';
import path from 'path';
import fs from 'fs';

export const getSalaryComponents = async (req: Request, res: Response) => {
  try {
    const components = await SalaryModel.getComponents();
    res.json({ success: true, components });
  } catch (error: any) {
    console.error('Get salary components error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch salary components', error: error.message });
  }
};

export const getEmployeeSalaryStructure = async (req: Request, res: Response) => {
  try {
    const { userId: userIdParam } = req.params;
    const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
    const currentUserId = (req as any).user?.userId;
    const role = (req as any).user?.role;

    // Employees can only view their own structure
    if (role === UserRole.EMPLOYEE && parseInt(userId) !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const structure = await SalaryModel.getEmployeeSalaryStructure(parseInt(userId as string));
    res.json({ success: true, structure });
  } catch (error: any) {
    console.error('Get salary structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch salary structure', error: error.message });
  }
};

export const updateSalaryStructure = async (req: Request, res: Response) => {
  try {
    // Only HR Manager can update salary structure
    if ((req as any).user?.role !== UserRole.HR_MANAGER) {
      return res.status(403).json({ success: false, message: 'Only HR Manager can update salary structure' });
    }

    const { userId: userIdParam } = req.params;
    const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
    const { components } = req.body;

    if (!Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ success: false, message: 'Components array is required' });
    }

    await SalaryModel.updateSalaryStructure(parseInt(userId as string), components);

    res.json({ success: true, message: 'Salary structure updated successfully' });
  } catch (error: any) {
    console.error('Update salary structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to update salary structure', error: error.message });
  }
};

export const generateSalary = async (req: Request, res: Response) => {
  try {
    // Only HR can generate salaries
    if ((req as any).user?.role !== UserRole.HR_MANAGER && (req as any).user?.role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can generate salaries' });
    }

    const { userId: userIdBody, month, year } = req.body;
    const userId = Array.isArray(userIdBody) ? userIdBody[0] : userIdBody;
    const generatedBy = (req as any).user!.userId;

    if (!userId || !month || !year) {
      return res.status(400).json({ success: false, message: 'User ID, month, and year are required' });
    }

    const monthYear = new Date(year, month - 1, 1);

    // Check if salary already exists
    const existing = await SalaryModel.findByUserId(parseInt(userId), { year, month });
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Salary for this month already exists' });
    }

    const salary = await SalaryModel.generateSalary(parseInt(userId), monthYear, generatedBy);

    res.status(201).json({ success: true, message: 'Salary generated successfully', salary });
  } catch (error: any) {
    console.error('Generate salary error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate salary', error: error.message });
  }
};

export const getSalaries = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;
    const { userId: paramUserId, department, year, month, status } = req.query;
    const paramUserIdStr = Array.isArray(paramUserId) ? paramUserId[0] : paramUserId;
    const departmentStr = Array.isArray(department) ? department[0] : department;
    const yearStr = Array.isArray(year) ? year[0] : year;
    const monthStr = Array.isArray(month) ? month[0] : month;
    const statusStr = Array.isArray(status) ? status[0] : status;

    let salaries;
    if (role === UserRole.EMPLOYEE) {
      // Employees can only see their own salaries
      salaries = await SalaryModel.findByUserId(userId!, {
        year: year ? parseInt(year as string) : undefined,
        month: month ? parseInt(month as string) : undefined
      });
    } else {
      // HR can see all salaries
      salaries = await SalaryModel.getAll({
        userId: paramUserIdStr ? parseInt(paramUserIdStr as string) : undefined,
        department: departmentStr as string,
        year: yearStr ? parseInt(yearStr as string) : undefined,
        month: monthStr ? parseInt(monthStr as string) : undefined,
        status: statusStr as SalaryStatus
      });
    }

    res.json({ success: true, salaries });
  } catch (error: any) {
    console.error('Get salaries error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch salaries', error: error.message });
  }
};

export const getSalaryById = async (req: Request, res: Response) => {
  try {
    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;

    const salary = await SalaryModel.findById(parseInt(id as string));
    if (!salary) {
      return res.status(404).json({ success: false, message: 'Salary not found' });
    }

    // Employees can only view their own salary
    if (role === UserRole.EMPLOYEE && salary.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const details = await SalaryModel.getSlipDetails(parseInt(id));

    res.json({ success: true, salary, details });
  } catch (error: any) {
    console.error('Get salary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch salary', error: error.message });
  }
};

export const generateSalarySlipPDF = async (req: Request, res: Response) => {
  try {
    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;

    console.log(`[SalaryController] 📄 Generating PDF for salary ID: ${id}`);

    const salary = await SalaryModel.findById(parseInt(id));
    if (!salary) {
      console.warn(`[SalaryController] ❌ Salary not found: ${id}`);
      return res.status(404).json({ success: false, message: 'Salary not found' });
    }

    // Employees can only view their own salary
    if (role === UserRole.EMPLOYEE && salary.user_id !== userId) {
      console.warn(`[SalaryController] 🚫 Access denied for user ${userId} to salary ${id}`);
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const details = await SalaryModel.getSlipDetails(parseInt(id as string));
    const [userRows] = await pool.execute('SELECT * FROM users WHERE id = ?', [salary.user_id]);
    const users = userRows as any[];
    const user = users[0];

    if (!user) {
      console.warn(`[SalaryController] ❌ User not found for salary: ${salary.user_id}`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate PDF
    console.log(`[SalaryController] ⚙️ Calling pdfGenerator for ${user.first_name}...`);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generatePDF({
        salary,
        details,
        user
      });
      console.log(`[SalaryController] ✅ PDF buffer generated (${pdfBuffer.length} bytes)`);
    } catch (error: any) {
      console.error(`[SalaryController] ❌ PDF generation failed:`, error);
      console.error(`[SalaryController] Error stack:`, error.stack);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate PDF', 
        error: error.message 
      });
    }

    // Save PDF if not already saved
    if (!salary.pdf_url) {
      const pdfDir = path.join(process.cwd(), 'uploads', 'salary-slips');
      try {
        if (!fs.existsSync(pdfDir)) {
          console.log(`[SalaryController] 📁 Creating directory: ${pdfDir}`);
          fs.mkdirSync(pdfDir, { recursive: true });
        }
        const pdfFilename = `salary-slip-${salary.id}-${Date.now()}.pdf`;
        const pdfPath = path.join(pdfDir, pdfFilename);
        fs.writeFileSync(pdfPath, pdfBuffer);
        
        const pdfUrl = `/uploads/salary-slips/${pdfFilename}`;
        await SalaryModel.updatePdfUrl(parseInt(id as string), pdfUrl);
        console.log(`[SalaryController] 💾 Saved and updated PDF URL: ${pdfUrl}`);
      } catch (saveError: any) {
        console.error(`[SalaryController] ⚠️ Failed to save PDF file:`, saveError.message);
        // Continue to send the buffer even if saving fails
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="salary-slip-${id as string}.pdf"`);
    res.send(pdfBuffer);
    console.log(`[SalaryController] 🚀 PDF sent successfully`);
  } catch (error: any) {
    console.error('[SalaryController] ❌ Generate PDF error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate PDF', 
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};


export const uploadBulkSalaries = async (req: Request, res: Response) => {
  try {
    // Only HR can upload bulk salaries
    const userRole = (req as any).user?.role;
    if (userRole !== UserRole.HR_MANAGER && userRole !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR Manager and HR Executive can upload bulk salaries' });
    }

    if (!((req as any).file)) {
      return res.status(400).json({ success: false, message: 'Excel file is required' });
    }

    const { month: monthQuery, year: yearQuery } = req.body;
    const monthStr = Array.isArray(monthQuery) ? monthQuery[0] : monthQuery;
    const yearStr = Array.isArray(yearQuery) ? yearQuery[0] : yearQuery;
    if (!monthStr || !yearStr) {
      return res.status(400).json({ success: false, message: 'Month and year are required' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile((req as any).file.path);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res.status(400).json({ success: false, message: 'Invalid Excel file format' });
    }

    const monthYear = new Date(parseInt(yearStr as string), parseInt(monthStr as string) - 1, 1);
    const generatedBy = (req as any).user!.userId;

    // Find header row and column indices
    let headerRow = 1;
    let idCol = 0, nameCol = 0, fullSalaryCol = 0, localSalaryCol = 0, oxoSalaryCol = 0, workingDaysCol = 0, epfCol = 0, allowancesCol = 0, deductionsCol = 0;
    
    // Search for header row (first 10 rows to handle merged cells or spacing)
    for (let rowNum = 1; rowNum <= 10; rowNum++) {
      const row = worksheet.getRow(rowNum);
      let foundHeaders = 0;
      
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellValue = cell.value?.toString().toLowerCase().trim() || '';
        
        // ID column - can be "id", "user id", "user_id", "employee id", etc.
        if ((cellValue === 'id' || cellValue.includes('user id') || cellValue.includes('user_id')) && idCol === 0) {
          idCol = colNumber;
          foundHeaders++;
        }
        // Name column
        else if ((cellValue === 'name' || cellValue.includes('employee name') || cellValue.includes('full name')) && nameCol === 0) {
          nameCol = colNumber;
          foundHeaders++;
        }
        // Full Salary column (optional - will be calculated if not present)
        else if ((cellValue.includes('full salary') || cellValue.includes('full_salary') || cellValue === 'full') && fullSalaryCol === 0) {
          fullSalaryCol = colNumber;
          foundHeaders++;
        }
        // Local Salary column (required)
        else if ((cellValue.includes('local salary') || cellValue.includes('local_salary') || cellValue === 'local') && localSalaryCol === 0) {
          localSalaryCol = colNumber;
          foundHeaders++;
        }
        // OXO International Salary column (required)
        else if ((cellValue.includes('oxo international salary') || cellValue.includes('oxo_international_salary') || 
                  cellValue.includes('oxo int') || cellValue.includes('international salary') || cellValue.includes('oxo international') ||
                  cellValue === 'oxo international salary') && oxoSalaryCol === 0) {
          oxoSalaryCol = colNumber;
          foundHeaders++;
          console.log(`  ✓ Found OXO International Salary column at index ${colNumber}, header value: "${cell.value?.toString()}"`);
        }
        // Working Days column
        else if ((cellValue.includes('working days') || cellValue.includes('working_days') || 
                  cellValue.includes('worked days') || cellValue.includes('worked_days') ||
                  cellValue.includes('work days') || cellValue === 'days') && workingDaysCol === 0) {
          workingDaysCol = colNumber;
          foundHeaders++;
        }
        // EPF column
        else if ((cellValue.includes('epf') || cellValue.includes('8%') || 
                  cellValue.includes('employee deduction') || cellValue.includes('provident fund')) && epfCol === 0) {
          epfCol = colNumber;
          foundHeaders++;
        }
        // Allowances column
        else if ((cellValue.includes('allowances') || cellValue.includes('allowance') || 
                  cellValue.includes('bonus')) && allowancesCol === 0) {
          allowancesCol = colNumber;
          foundHeaders++;
          console.log(`  ✓ Found Allowances column at index ${colNumber}, header value: "${cell.value?.toString()}"`);
        }
        // Salary Advance/Deductions column
        else if ((cellValue.includes('salary advance') || cellValue.includes('deductions') || 
                  cellValue.includes('salary deduction') || cellValue.includes('advance')) && deductionsCol === 0) {
          deductionsCol = colNumber;
          foundHeaders++;
          console.log(`  ✓ Found Salary Advance/Deductions column at index ${colNumber}, header value: "${cell.value?.toString()}"`);
        }
      });
      
      if (foundHeaders >= 3) { // At least 3 columns found
        headerRow = rowNum;
        break;
      }
    }

    // Validate required columns (Local Salary and OXO International are required, Full Salary is optional)
    console.log(`Column detection results: ID=${idCol}, Local=${localSalaryCol}, OXO=${oxoSalaryCol}, WorkingDays=${workingDaysCol}, EPF=${epfCol}, Allowances=${allowancesCol}, Deductions=${deductionsCol}`);
    
    const missingColumns: string[] = [];
    if (idCol === 0) missingColumns.push('id');
    if (localSalaryCol === 0) missingColumns.push('Local Salary');
    if (oxoSalaryCol === 0) missingColumns.push('OXO International Salary');
    
    if (missingColumns.length > 0) {
      console.error(`Missing required columns: ${missingColumns.join(', ')}`);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid Excel format. Missing required columns: ${missingColumns.join(', ')}. Found columns: ${idCol > 0 ? 'id' : ''} ${fullSalaryCol > 0 ? 'Full Salary' : ''} ${localSalaryCol > 0 ? 'Local Salary' : ''} ${oxoSalaryCol > 0 ? 'OXO International Salary' : ''} ${workingDaysCol > 0 ? 'Working Days' : ''} ${epfCol > 0 ? 'EPF' : ''}`,
        foundColumns: {
          id: idCol > 0,
          fullSalary: fullSalaryCol > 0,
          localSalary: localSalaryCol > 0,
          oxoSalary: oxoSalaryCol > 0,
          workingDays: workingDaysCol > 0,
          epf: epfCol > 0
        }
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Process each data row
    for (let rowNum = headerRow + 1; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      
      try {
        // Get cell values
        const idValue = row.getCell(idCol).value?.toString().trim();
        if (!idValue || idValue === '') continue; // Skip empty rows

        // Try to parse as number first (user ID)
        let userId: number | null = null;
        const parsedId = parseInt(idValue);
        
        if (!isNaN(parsedId)) {
          // It's a numeric ID
          userId = parsedId;
        } else {
          // Try to find by employee_id
          const [empRows] = await pool.execute('SELECT id FROM users WHERE employee_id = ?', [idValue]);
          const empUsers = empRows as any[];
          if (empUsers.length > 0) {
            userId = empUsers[0].id;
          }
        }

        if (!userId || isNaN(userId)) {
          results.failed++;
          results.errors.push(`Row ${rowNum}: Invalid ID "${idValue}" - not found in system`);
          continue;
        }

        // Verify user exists
        const [userRows] = await pool.execute('SELECT id, first_name, last_name FROM users WHERE id = ?', [userId]);
        const users = userRows as any[];
        if (users.length === 0) {
          results.failed++;
          results.errors.push(`Row ${rowNum}: User with ID ${userId} not found`);
          continue;
        }

        // Helper function to parse numeric values from cells
        const parseNumericValue = (cell: any): number => {
          if (!cell) return 0;
          const value = cell.value;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            // Remove commas, currency symbols, and whitespace
            const cleaned = value.replace(/[,\s$₹€£]/g, '').trim();
            return parseFloat(cleaned) || 0;
          }
          return 0;
        };

        // Parse salary values
        const localSalary = parseNumericValue(row.getCell(localSalaryCol));
        const oxoSalary = parseNumericValue(row.getCell(oxoSalaryCol));
        
        // Debug logging
        console.log(`Row ${rowNum} - Parsed values: Local=${localSalary}, OXO=${oxoSalary}`);
        console.log(`  - Local cell value: ${row.getCell(localSalaryCol)?.value}, type: ${typeof row.getCell(localSalaryCol)?.value}`);
        console.log(`  - OXO cell value: ${row.getCell(oxoSalaryCol)?.value}, type: ${typeof row.getCell(oxoSalaryCol)?.value}`);
        
        // Calculate Full Salary = Local Salary + OXO International Salary (ignore Full Salary column if present)
        const fullSalary = localSalary + oxoSalary;
        
        // Parse working days (format: "Available Dates, Leaves, Worked Days" or just "Worked Days")
        let workedDays = 0, availableDates = 0, leaves = 0;
        
        if (workingDaysCol > 0) {
          const workingDaysCell = row.getCell(workingDaysCol);
          const workingDaysValue = workingDaysCell?.value?.toString().trim() || '';
          
          if (workingDaysValue.includes(',')) {
            const parts = workingDaysValue.split(',').map(p => p.trim());
            if (parts.length >= 3) {
              availableDates = parseFloat(parts[0].replace(/[^\d.]/g, '')) || 0;
              leaves = parseFloat(parts[1].replace(/[^\d.]/g, '')) || 0;
              workedDays = parseFloat(parts[2].replace(/[^\d.]/g, '')) || 0;
            } else if (parts.length === 2) {
              // Assume format: "Leaves, Worked Days"
              leaves = parseFloat(parts[0].replace(/[^\d.]/g, '')) || 0;
              workedDays = parseFloat(parts[1].replace(/[^\d.]/g, '')) || 0;
            } else {
              workedDays = parseFloat(parts[0].replace(/[^\d.]/g, '')) || 0;
            }
          } else {
            workedDays = parseNumericValue(workingDaysCell);
          }
        }
        
        const epfDeduction = epfCol > 0 ? parseNumericValue(row.getCell(epfCol)) : 0;
        
        // Parse allowances and salary advance/deductions
        const allowances = allowancesCol > 0 ? parseNumericValue(row.getCell(allowancesCol)) : 0;
        const salaryAdvanceDeductions = deductionsCol > 0 ? parseNumericValue(row.getCell(deductionsCol)) : 0;

        // Create salary from Excel data
        console.log(`Creating salary for user ${userId}: Local=${localSalary}, OXO=${oxoSalary}, EPF=${epfDeduction}, Allowances=${allowances}, Deductions=${salaryAdvanceDeductions}`);
        await SalaryModel.createSalaryFromExcel(
          userId,
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
            salaryAdvanceDeductions
          },
          generatedBy
        );
        console.log(`Successfully created salary for user ${userId}`);

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: ${error.message}`);
        console.error(`Error processing row ${rowNum}:`, error);
      }
    }

    // Delete uploaded file
    try {
      fs.unlinkSync((req as any).file.path as string);
    } catch (error) {
      console.error('Error deleting uploaded file:', error);
    }

    res.json({ 
      success: true, 
      message: `Processed ${results.success} salaries successfully${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      results: {
        success: results.success,
        failed: results.failed,
        errors: results.errors.slice(0, 10) // Limit to first 10 errors
      }
    });
  } catch (error: any) {
    console.error('Upload bulk salaries error:', error);
    res.status(500).json({ success: false, message: 'Failed to process bulk salaries', error: error.message });
  }
};

export const updateSalaryStatus = async (req: Request, res: Response) => {
  try {
    // Only HR can update salary status
    if ((req as any).user?.role !== UserRole.HR_MANAGER && (req as any).user?.role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can update salary status' });
    }

    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { status: statusQuery, paid_date: paid_dateQuery } = req.body;
    const status = Array.isArray(statusQuery) ? statusQuery[0] : statusQuery;
    const paid_date = Array.isArray(paid_dateQuery) ? paid_dateQuery[0] : paid_dateQuery;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const updated = await SalaryModel.updateStatus(
      parseInt(id as string),
      status as SalaryStatus,
      paid_date ? new Date(paid_date) : undefined
    );

    res.json({ success: true, message: 'Salary status updated', salary: updated });
  } catch (error: any) {
    console.error('Update salary status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update salary status', error: error.message });
  }
};

export const getYearToDateEarnings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { year: yearQuery } = req.query;
    const yearStr = Array.isArray(yearQuery) ? yearQuery[0] : yearQuery;
    const currentYear = yearStr ? parseInt(yearStr as string) : new Date().getFullYear();

    const salaries = await SalaryModel.findByUserId(userId!, { year: currentYear });

    const totalEarnings = salaries.reduce((sum, salary) => sum + parseFloat(salary.total_earnings.toString()), 0);
    const totalDeductions = salaries.reduce((sum, salary) => sum + parseFloat(salary.total_deductions.toString()), 0);
    const totalNet = salaries.reduce((sum, salary) => sum + parseFloat(salary.net_salary.toString()), 0);

    res.json({
      success: true,
      year: currentYear,
      totalEarnings,
      totalDeductions,
      totalNet,
      salaryCount: salaries.length
    });
  } catch (error: any) {
    console.error('Get YTD earnings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch YTD earnings', error: error.message });
  }
};
