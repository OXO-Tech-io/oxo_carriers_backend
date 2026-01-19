import pool from '../config/database';
import { MonthlySalary, SalaryComponent, EmployeeSalaryStructure, EmployeeSalaryStructureWithComponent, SalaryStatus, ComponentType } from '../types';

export class SalaryModel {
  static async getComponents(): Promise<SalaryComponent[]> {
    const [rows] = await pool.execute('SELECT * FROM salary_components WHERE is_active = true ORDER BY type, name');
    return rows as SalaryComponent[];
  }

  static async getEmployeeSalaryStructure(userId: number): Promise<EmployeeSalaryStructureWithComponent[]> {
    const [rows] = await pool.execute(
      `SELECT ess.*, sc.name as component_name, sc.type as component_type
       FROM employee_salary_structure ess
       JOIN salary_components sc ON ess.component_id = sc.id
       WHERE ess.user_id = ? AND (ess.end_date IS NULL OR ess.end_date >= CURDATE())
       ORDER BY sc.type, sc.name`,
      [userId]
    );
    return rows as EmployeeSalaryStructureWithComponent[];
  }

  static async updateSalaryStructure(
    userId: number,
    components: Array<{ component_id: number; amount: number; is_percentage?: boolean; percentage_of?: string }>
  ): Promise<void> {
    // End current structure
    await pool.execute(
      'UPDATE employee_salary_structure SET end_date = CURDATE() WHERE user_id = ? AND end_date IS NULL',
      [userId]
    );

    // Insert new structure
    for (const component of components) {
      await pool.execute(
        `INSERT INTO employee_salary_structure (user_id, component_id, amount, is_percentage, percentage_of, effective_date)
         VALUES (?, ?, ?, ?, ?, CURDATE())`,
        [
          userId,
          component.component_id,
          component.amount,
          component.is_percentage || false,
          component.percentage_of || null
        ]
      );
    }
  }

  static async generateSalary(
    userId: number,
    monthYear: Date,
    generatedBy: number
  ): Promise<MonthlySalary> {
    // Get salary structure
    const structure = await this.getEmployeeSalaryStructure(userId);
    
    let basicSalary = 0;
    let totalEarnings = 0;
    let totalDeductions = 0;

    const slipDetails: Array<{ component_id: number; amount: number; type: ComponentType }> = [];

    for (const item of structure) {
      let amount = item.amount;
      
      if (item.is_percentage && item.percentage_of) {
        // Calculate percentage-based component
        const baseComponent = structure.find(s => s.component_id === item.component_id);
        if (baseComponent) {
          amount = (baseComponent.amount * item.amount) / 100;
        }
      }

      if (item.component_type === ComponentType.EARNING) {
        totalEarnings += amount;
        if (item.component_name === 'Basic Salary') {
          basicSalary = amount;
        }
      } else {
        totalDeductions += amount;
      }

      slipDetails.push({
        component_id: item.component_id,
        amount,
        type: item.component_type as ComponentType
      });
    }

    const netSalary = totalEarnings - totalDeductions;

    // Extract Local Salary and OXO International Salary from structure if available
    let localSalary = 0;
    let oxoInternationalSalary = 0;
    
    for (const item of structure) {
      if (item.component_name === 'Local Salary') {
        localSalary = item.amount;
      } else if (item.component_name === 'OXO International Salary') {
        oxoInternationalSalary = item.amount;
      }
    }

    // Insert monthly salary
    const [result] = await pool.execute(
      `INSERT INTO monthly_salaries (user_id, month_year, basic_salary, local_salary, oxo_international_salary, total_earnings, total_deductions, net_salary, status, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?)`,
      [userId, monthYear, basicSalary, localSalary, oxoInternationalSalary, totalEarnings, totalDeductions, netSalary, generatedBy]
    );

    const insertResult = result as any;
    const salaryId = insertResult.insertId;

    // Insert slip details
    for (const detail of slipDetails) {
      await pool.execute(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES (?, ?, ?, ?)',
        [salaryId, detail.component_id, detail.amount, detail.type]
      );
    }

    const createdSalary = await this.findById(salaryId);
    if (!createdSalary) {
      throw new Error('Failed to create salary record');
    }
    return createdSalary;
  }

  static async findById(id: number): Promise<MonthlySalary | null> {
    const [rows] = await pool.execute('SELECT * FROM monthly_salaries WHERE id = ?', [id]);
    const salaries = rows as MonthlySalary[];
    return salaries[0] || null;
  }

  static async findByUserId(userId: number, filters?: { year?: number; month?: number }): Promise<MonthlySalary[]> {
    let query = 'SELECT * FROM monthly_salaries WHERE user_id = ?';
    const params: any[] = [userId];

    if (filters?.year) {
      query += ' AND YEAR(month_year) = ?';
      params.push(filters.year);
    }

    if (filters?.month) {
      query += ' AND MONTH(month_year) = ?';
      params.push(filters.month);
    }

    query += ' ORDER BY month_year DESC';

    const [rows] = await pool.execute(query, params);
    return rows as MonthlySalary[];
  }

  static async getAll(filters?: {
    userId?: number;
    department?: string;
    year?: number;
    month?: number;
    status?: SalaryStatus;
  }): Promise<any[]> {
    let query = `
      SELECT ms.*, u.first_name, u.last_name, u.employee_id, u.department
      FROM monthly_salaries ms
      JOIN users u ON ms.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.userId) {
      query += ' AND ms.user_id = ?';
      params.push(filters.userId);
    }

    if (filters?.department) {
      query += ' AND u.department = ?';
      params.push(filters.department);
    }

    if (filters?.year) {
      query += ' AND YEAR(ms.month_year) = ?';
      params.push(filters.year);
    }

    if (filters?.month) {
      query += ' AND MONTH(ms.month_year) = ?';
      params.push(filters.month);
    }

    if (filters?.status) {
      query += ' AND ms.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY ms.month_year DESC, u.first_name';

    const [rows] = await pool.execute(query, params);
    return rows as any[];
  }

  static async getSlipDetails(salaryId: number): Promise<any[]> {
    const [rows] = await pool.execute(
      `SELECT ssd.*, sc.name as component_name, sc.type as component_type
       FROM salary_slip_details ssd
       JOIN salary_components sc ON ssd.component_id = sc.id
       WHERE ssd.salary_id = ?
       ORDER BY sc.type, sc.name`,
      [salaryId]
    );
    return rows as any[];
  }

  static async updateStatus(id: number, status: SalaryStatus, paidDate?: Date): Promise<MonthlySalary | null> {
    if (status === SalaryStatus.PAID && paidDate) {
      await pool.execute(
        'UPDATE monthly_salaries SET status = ?, paid_date = ? WHERE id = ?',
        [status, paidDate, id]
      );
    } else {
      await pool.execute('UPDATE monthly_salaries SET status = ? WHERE id = ?', [status, id]);
    }
    return await this.findById(id);
  }

  static async updatePdfUrl(id: number, pdfUrl: string): Promise<void> {
    await pool.execute('UPDATE monthly_salaries SET pdf_url = ? WHERE id = ?', [pdfUrl, id]);
  }

  static async bulkGenerateSalaries(userIds: number[], monthYear: Date, generatedBy: number): Promise<number> {
    let count = 0;
    for (const userId of userIds) {
      try {
        await this.generateSalary(userId, monthYear, generatedBy);
        count++;
      } catch (error) {
        console.error(`Failed to generate salary for user ${userId}:`, error);
      }
    }
    return count;
  }

  static async createSalaryFromExcel(
    userId: number,
    monthYear: Date,
    excelData: {
      fullSalary: number;
      localSalary: number;
      oxoInternationalSalary: number;
      workedDays: number;
      availableDates: number;
      leaves: number;
      epfDeduction: number;
    },
    generatedBy: number
  ): Promise<MonthlySalary> {
    // Calculate Full Salary = Local Salary + OXO International Salary
    const calculatedFullSalary = excelData.localSalary + excelData.oxoInternationalSalary;
    // Use provided fullSalary if it matches calculation, otherwise use calculated value
    const fullSalary = excelData.fullSalary > 0 && Math.abs(excelData.fullSalary - calculatedFullSalary) < 0.01 
      ? excelData.fullSalary 
      : calculatedFullSalary;
    
    // Calculate basic salary (use Full Salary as basic)
    const basicSalary = fullSalary;
    
    // Calculate earnings (Full Salary = Local + OXO International)
    const totalEarnings = fullSalary;
    
    // Calculate EPF deduction (8% of Local Salary) - use provided value or calculate if not provided
    let epfDeduction = excelData.epfDeduction;
    if (epfDeduction === 0 && excelData.localSalary > 0) {
      epfDeduction = excelData.localSalary * 0.08; // 8% of Local Salary
    }
    
    // Calculate deductions
    const totalDeductions = epfDeduction;
    
    const netSalary = totalEarnings - totalDeductions;

    // Ensure columns exist (for backward compatibility with existing databases)
    try {
      const [columns]: any = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'monthly_salaries' 
        AND COLUMN_NAME IN ('local_salary', 'oxo_international_salary')
      `);
      
      const existingColumns = columns.map((c: any) => c.COLUMN_NAME);
      
      if (!existingColumns.includes('local_salary')) {
        await pool.execute(`
          ALTER TABLE monthly_salaries 
          ADD COLUMN local_salary DECIMAL(10,2) DEFAULT 0 AFTER basic_salary
        `);
        console.log('  ✓ Added local_salary column');
      }
      
      if (!existingColumns.includes('oxo_international_salary')) {
        await pool.execute(`
          ALTER TABLE monthly_salaries 
          ADD COLUMN oxo_international_salary DECIMAL(10,2) DEFAULT 0 AFTER local_salary
        `);
        console.log('  ✓ Added oxo_international_salary column');
      }
    } catch (error: any) {
      // Columns might already exist or other error, log but continue
      console.warn('  ⚠ Column check/add warning:', error.message);
    }

    // Ensure values are numbers
    const localSalaryValue = Number(excelData.localSalary) || 0;
    const oxoInternationalSalaryValue = Number(excelData.oxoInternationalSalary) || 0;
    
    // Insert monthly salary
    console.log(`Inserting salary for user ${userId}: Local=${localSalaryValue}, OXO=${oxoInternationalSalaryValue}, Full=${fullSalary}`);
    console.log(`  - Type check: Local is ${typeof localSalaryValue}, OXO is ${typeof oxoInternationalSalaryValue}`);
    console.log(`  - Raw values: Local=${excelData.localSalary}, OXO=${excelData.oxoInternationalSalary}`);
    
    const [result] = await pool.execute(
      `INSERT INTO monthly_salaries (user_id, month_year, basic_salary, local_salary, oxo_international_salary, total_earnings, total_deductions, net_salary, status, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?)
       ON DUPLICATE KEY UPDATE
       basic_salary = VALUES(basic_salary),
       local_salary = VALUES(local_salary),
       oxo_international_salary = VALUES(oxo_international_salary),
       total_earnings = VALUES(total_earnings),
       total_deductions = VALUES(total_deductions),
       net_salary = VALUES(net_salary),
       status = 'generated',
       generated_by = VALUES(generated_by)`,
      [userId, monthYear, basicSalary, localSalaryValue, oxoInternationalSalaryValue, totalEarnings, totalDeductions, netSalary, generatedBy]
    );
    
    // Verify the insert immediately after
    const [verify] = await pool.execute(
      'SELECT id, local_salary, oxo_international_salary, basic_salary FROM monthly_salaries WHERE user_id = ? AND month_year = ?',
      [userId, monthYear]
    );
    const verifyRows = verify as any[];
    if (verifyRows.length > 0) {
      const saved = verifyRows[0];
      console.log(`✓ Verified salary record ID ${saved.id}:`);
      console.log(`  - Local Salary: ${saved.local_salary} (expected: ${localSalaryValue})`);
      console.log(`  - OXO International Salary: ${saved.oxo_international_salary} (expected: ${oxoInternationalSalaryValue})`);
      console.log(`  - Basic Salary: ${saved.basic_salary}`);
      
      if (Number(saved.oxo_international_salary) !== oxoInternationalSalaryValue) {
        console.error(`  ✗ MISMATCH: OXO International Salary not saved correctly!`);
        console.error(`    Expected: ${oxoInternationalSalaryValue}, Got: ${saved.oxo_international_salary}`);
      } else {
        console.log(`  ✓ OXO International Salary saved correctly!`);
      }
    } else {
      console.error(`✗ Failed to verify salary record for user ${userId}`);
    }

    const insertResult = result as any;
    let salaryId = insertResult.insertId;

    // If salary already exists, get the existing ID
    if (!salaryId || salaryId === 0) {
      const [existing] = await pool.execute(
        'SELECT id FROM monthly_salaries WHERE user_id = ? AND month_year = ?',
        [userId, monthYear]
      );
      const existingRows = existing as any[];
      if (existingRows.length > 0) {
        salaryId = existingRows[0].id;
        // Delete existing slip details
        await pool.execute('DELETE FROM salary_slip_details WHERE salary_id = ?', [salaryId]);
      }
    }

    // Get or create salary components
    const [fullSalaryComponent] = await pool.execute(
      "SELECT id FROM salary_components WHERE name = 'Full Salary'"
    );
    const [localSalaryComponent] = await pool.execute(
      "SELECT id FROM salary_components WHERE name = 'Local Salary'"
    );
    const [oxoSalaryComponent] = await pool.execute(
      "SELECT id FROM salary_components WHERE name = 'OXO International Salary'"
    );
    const [epfComponent] = await pool.execute(
      "SELECT id FROM salary_components WHERE name = 'Provident Fund'"
    );

    const fullSalaryId = (fullSalaryComponent as any[])[0]?.id;
    const localSalaryId = (localSalaryComponent as any[])[0]?.id;
    let oxoSalaryId = (oxoSalaryComponent as any[])[0]?.id;
    const epfId = (epfComponent as any[])[0]?.id;

    // Create OXO International Salary component if it doesn't exist
    if (!oxoSalaryId) {
      const [insertResult] = await pool.execute(
        "INSERT INTO salary_components (name, type, is_default, is_active) VALUES ('OXO International Salary', 'earning', false, true)"
      );
      oxoSalaryId = (insertResult as any).insertId;
      console.log('Created OXO International Salary component with ID:', oxoSalaryId);
    }

    // Insert slip details for earnings
    // Insert Local Salary
    if (localSalaryId && excelData.localSalary > 0) {
      await pool.execute(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES (?, ?, ?, ?)',
        [salaryId, localSalaryId, excelData.localSalary, 'earning']
      );
      console.log(`Inserted Local Salary: ${excelData.localSalary} for salary ID: ${salaryId}`);
    } else {
      console.warn(`Local Salary not inserted - localSalaryId: ${localSalaryId}, amount: ${excelData.localSalary}`);
    }
    
    // Insert OXO International Salary (ALWAYS insert if amount > 0, even if component doesn't exist we create it above)
    if (excelData.oxoInternationalSalary > 0) {
      if (oxoSalaryId) {
        await pool.execute(
          'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES (?, ?, ?, ?)',
          [salaryId, oxoSalaryId, excelData.oxoInternationalSalary, 'earning']
        );
        console.log(`Inserted OXO International Salary: ${excelData.oxoInternationalSalary} for salary ID: ${salaryId}`);
      } else {
        console.error(`OXO International Salary component ID is null for salary ID: ${salaryId}, amount: ${excelData.oxoInternationalSalary}`);
      }
    } else {
      console.warn(`OXO International Salary not inserted - amount is 0 or negative: ${excelData.oxoInternationalSalary}`);
    }
    
    // Insert Full Salary as calculated (Local + OXO) - optional, for display purposes
    if (fullSalaryId && fullSalary > 0) {
      await pool.execute(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES (?, ?, ?, ?)',
        [salaryId, fullSalaryId, fullSalary, 'earning']
      );
    }

    // Insert slip details for deductions
    if (epfId && epfDeduction > 0) {
      await pool.execute(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES (?, ?, ?, ?)',
        [salaryId, epfId, epfDeduction, 'deduction']
      );
    }

    const createdSalary = await this.findById(salaryId);
    if (!createdSalary) {
      throw new Error('Failed to create salary record');
    }
    return createdSalary;
  }
}
