import pool from '../config/database';
import { MonthlySalary, SalaryComponent, EmployeeSalaryStructure, EmployeeSalaryStructureWithComponent, SalaryStatus, ComponentType } from '../types';
import { logger as baseLogger } from '../lib/logger';

const log = baseLogger.child({ module: 'salary-model' });

export class SalaryModel {
  static async getComponents(): Promise<SalaryComponent[]> {
    const result = await pool.query('SELECT * FROM salary_components WHERE is_active = true ORDER BY type, name');
    return result.rows as SalaryComponent[];
  }

  static async getEmployeeSalaryStructure(userId: number): Promise<EmployeeSalaryStructureWithComponent[]> {
    const result = await pool.query(
      `SELECT ess.*, sc.name as component_name, sc.type as component_type
       FROM employee_salary_structure ess
       JOIN salary_components sc ON ess.component_id = sc.id
       WHERE ess.user_id = $1 AND (ess.end_date IS NULL OR ess.end_date >= CURRENT_DATE)
       ORDER BY sc.type, sc.name`,
      [userId]
    );
    return result.rows as EmployeeSalaryStructureWithComponent[];
  }

  static async updateSalaryStructure(
    userId: number,
    components: Array<{ component_id: number; amount: number; is_percentage?: boolean; percentage_of?: string }>
  ): Promise<void> {
    // End current structure
    await pool.query(
      'UPDATE employee_salary_structure SET end_date = CURRENT_DATE WHERE user_id = $1 AND end_date IS NULL',
      [userId]
    );

    // Insert new structure
    for (const component of components) {
      await pool.query(
        `INSERT INTO employee_salary_structure (user_id, component_id, amount, is_percentage, percentage_of, effective_date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
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
    const result = await pool.query(
      `INSERT INTO monthly_salaries (user_id, month_year, basic_salary, local_salary, oxo_international_salary, total_earnings, total_deductions, net_salary, status, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'generated', $9) RETURNING id`,
      [userId, monthYear, basicSalary, localSalary, oxoInternationalSalary, totalEarnings, totalDeductions, netSalary, generatedBy]
    );

    const salaryId = (result.rows[0] as any).id;

    // Insert slip details
    for (const detail of slipDetails) {
      await pool.query(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES ($1, $2, $3, $4)',
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
    const result = await pool.query('SELECT * FROM monthly_salaries WHERE id = $1', [id]);
    const salaries = result.rows as MonthlySalary[];
    return salaries[0] || null;
  }

  static async findByUserId(userId: number, filters?: { year?: number; month?: number }): Promise<MonthlySalary[]> {
    let query = 'SELECT * FROM monthly_salaries WHERE user_id = $1';
    const params: any[] = [userId];

    if (filters?.year) {
      params.push(filters.year);
      query += ` AND EXTRACT(YEAR FROM month_year) = $${params.length}`;
    }

    if (filters?.month) {
      params.push(filters.month);
      query += ` AND EXTRACT(MONTH FROM month_year) = $${params.length}`;
    }

    query += ' ORDER BY month_year DESC';

    const result = await pool.query(query, params);
    return result.rows as MonthlySalary[];
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
      params.push(filters.userId);
      query += ` AND ms.user_id = $${params.length}`;
    }

    if (filters?.department) {
      params.push(filters.department);
      query += ` AND u.department = $${params.length}`;
    }

    if (filters?.year) {
      params.push(filters.year);
      query += ` AND EXTRACT(YEAR FROM ms.month_year) = $${params.length}`;
    }

    if (filters?.month) {
      params.push(filters.month);
      query += ` AND EXTRACT(MONTH FROM ms.month_year) = $${params.length}`;
    }

    if (filters?.status) {
      params.push(filters.status);
      query += ` AND ms.status = $${params.length}`;
    }

    query += ' ORDER BY ms.month_year DESC, u.first_name';

    const result = await pool.query(query, params);
    return result.rows as any[];
  }

  static async getSlipDetails(salaryId: number): Promise<any[]> {
    const result = await pool.query(
      `SELECT ssd.*, sc.name as component_name, sc.type as component_type
       FROM salary_slip_details ssd
       JOIN salary_components sc ON ssd.component_id = sc.id
       WHERE ssd.salary_id = $1
       ORDER BY sc.type, sc.name`,
      [salaryId]
    );
    return result.rows as any[];
  }

  static async updateStatus(id: number, status: SalaryStatus, paidDate?: Date): Promise<MonthlySalary | null> {
    if (status === SalaryStatus.PAID && paidDate) {
      await pool.query(
        'UPDATE monthly_salaries SET status = $1, paid_date = $2 WHERE id = $3',
        [status, paidDate, id]
      );
    } else {
      await pool.query('UPDATE monthly_salaries SET status = $1 WHERE id = $2', [status, id]);
    }
    return await this.findById(id);
  }

  static async updatePdfUrl(id: number, pdfUrl: string): Promise<void> {
    await pool.query('UPDATE monthly_salaries SET pdf_url = $1 WHERE id = $2', [pdfUrl, id]);
  }

  static async bulkGenerateSalaries(userIds: number[], monthYear: Date, generatedBy: number): Promise<number> {
    let count = 0;
    for (const userId of userIds) {
      try {
        await this.generateSalary(userId, monthYear, generatedBy);
        count++;
      } catch (error) {
        log.error({ err: error, userId }, 'Failed to generate salary');
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
      allowances?: number;
      salaryAdvanceDeductions?: number;
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

    // Get allowances and salary advance/deductions (default to 0 if not provided)
    const allowances = excelData.allowances || 0;
    const salaryAdvanceDeductions = excelData.salaryAdvanceDeductions || 0;

    // Calculate earnings (Full Salary + Allowances)
    const totalEarnings = fullSalary + allowances;

    // Calculate EPF deduction (8% of Local Salary) - use provided value or calculate if not provided
    let epfDeduction = excelData.epfDeduction;
    if (epfDeduction === 0 && excelData.localSalary > 0) {
      epfDeduction = excelData.localSalary * 0.08; // 8% of Local Salary
    }

    // Calculate deductions (EPF + Salary Advance/Deductions)
    const totalDeductions = epfDeduction + salaryAdvanceDeductions;

    const netSalary = totalEarnings - totalDeductions;

    // Ensure columns exist (for backward compatibility with existing databases)
    try {
      const columnsResult = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
        AND table_name = 'monthly_salaries'
        AND column_name IN ('local_salary', 'oxo_international_salary')
      `);

      const existingColumns = (columnsResult.rows as any[]).map(c => c.column_name);

      if (!existingColumns.includes('local_salary')) {
        await pool.query(`
          ALTER TABLE monthly_salaries
          ADD COLUMN local_salary DECIMAL(10,2) DEFAULT 0
        `);
        log.info('Added local_salary column');
      }

      if (!existingColumns.includes('oxo_international_salary')) {
        await pool.query(`
          ALTER TABLE monthly_salaries
          ADD COLUMN oxo_international_salary DECIMAL(10,2) DEFAULT 0
        `);
        log.info('Added oxo_international_salary column');
      }
    } catch (error: any) {
      // Columns might already exist or other error, log but continue
      log.warn({ err: error }, 'Column check/add warning');
    }

    // Ensure values are numbers
    const localSalaryValue = Number(excelData.localSalary) || 0;
    const oxoInternationalSalaryValue = Number(excelData.oxoInternationalSalary) || 0;

    // Insert monthly salary
    log.debug(
      {
        userId,
        localSalaryValue,
        oxoInternationalSalaryValue,
        fullSalary,
        rawLocal: excelData.localSalary,
        rawOxo: excelData.oxoInternationalSalary,
      },
      'Inserting salary',
    );

    const upsertResult = await pool.query(
      `INSERT INTO monthly_salaries (user_id, month_year, basic_salary, local_salary, oxo_international_salary, total_earnings, total_deductions, net_salary, status, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'generated', $9)
       ON CONFLICT (user_id, month_year) DO UPDATE SET
         basic_salary = EXCLUDED.basic_salary,
         local_salary = EXCLUDED.local_salary,
         oxo_international_salary = EXCLUDED.oxo_international_salary,
         total_earnings = EXCLUDED.total_earnings,
         total_deductions = EXCLUDED.total_deductions,
         net_salary = EXCLUDED.net_salary,
         status = 'generated',
         generated_by = EXCLUDED.generated_by
       RETURNING id`,
      [userId, monthYear, basicSalary, localSalaryValue, oxoInternationalSalaryValue, totalEarnings, totalDeductions, netSalary, generatedBy]
    );

    // Verify the insert immediately after
    const verifyResult = await pool.query(
      'SELECT id, local_salary, oxo_international_salary, basic_salary FROM monthly_salaries WHERE user_id = $1 AND month_year = $2',
      [userId, monthYear]
    );
    const verifyRows = verifyResult.rows as any[];
    if (verifyRows.length > 0) {
      const saved = verifyRows[0];
      log.debug(
        {
          id: saved.id,
          localSalary: saved.local_salary,
          oxoInternationalSalary: saved.oxo_international_salary,
          basicSalary: saved.basic_salary,
          expectedLocal: localSalaryValue,
          expectedOxo: oxoInternationalSalaryValue,
        },
        'Verified salary record',
      );

      if (Number(saved.oxo_international_salary) !== oxoInternationalSalaryValue) {
        log.error(
          {
            expected: oxoInternationalSalaryValue,
            actual: saved.oxo_international_salary,
          },
          'MISMATCH: OXO International Salary not saved correctly',
        );
      } else {
        log.debug('OXO International Salary saved correctly');
      }
    } else {
      log.error({ userId }, 'Failed to verify salary record');
    }

    let salaryId = (upsertResult.rows[0] as any)?.id;

    // If we got an ID from the upsert, delete any existing slip details so we can re-insert
    if (salaryId) {
      await pool.query('DELETE FROM salary_slip_details WHERE salary_id = $1', [salaryId]);
    } else {
      // Fallback: look up the existing row id
      const existingResult = await pool.query(
        'SELECT id FROM monthly_salaries WHERE user_id = $1 AND month_year = $2',
        [userId, monthYear]
      );
      const existingRows = existingResult.rows as any[];
      if (existingRows.length > 0) {
        salaryId = existingRows[0].id;
        await pool.query('DELETE FROM salary_slip_details WHERE salary_id = $1', [salaryId]);
      }
    }

    // Get or create salary components
    const fullSalaryComponent = await pool.query(
      "SELECT id FROM salary_components WHERE name = 'Full Salary'"
    );
    const localSalaryComponent = await pool.query(
      "SELECT id FROM salary_components WHERE name = 'Local Salary'"
    );
    const oxoSalaryComponent = await pool.query(
      "SELECT id FROM salary_components WHERE name = 'OXO International Salary'"
    );
    const epfComponent = await pool.query(
      "SELECT id FROM salary_components WHERE name = 'Provident Fund'"
    );

    const fullSalaryId = (fullSalaryComponent.rows as any[])[0]?.id;
    const localSalaryId = (localSalaryComponent.rows as any[])[0]?.id;
    let oxoSalaryId = (oxoSalaryComponent.rows as any[])[0]?.id;
    const epfId = (epfComponent.rows as any[])[0]?.id;

    // Create OXO International Salary component if it doesn't exist
    if (!oxoSalaryId) {
      const insertResult = await pool.query(
        "INSERT INTO salary_components (name, type, is_default, is_active) VALUES ('OXO International Salary', 'earning', false, true) RETURNING id"
      );
      oxoSalaryId = (insertResult.rows[0] as any).id;
      log.info({ oxoSalaryId }, 'Created OXO International Salary component');
    }

    // Insert slip details for earnings
    // Insert Local Salary
    if (localSalaryId && excelData.localSalary > 0) {
      await pool.query(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES ($1, $2, $3, $4)',
        [salaryId, localSalaryId, excelData.localSalary, 'earning']
      );
      log.debug({ amount: excelData.localSalary, salaryId }, 'Inserted Local Salary slip detail');
    } else {
      log.warn({ localSalaryId, amount: excelData.localSalary }, 'Local Salary not inserted');
    }

    // Insert OXO International Salary (ALWAYS insert if amount > 0, even if component doesn't exist we create it above)
    if (excelData.oxoInternationalSalary > 0) {
      if (oxoSalaryId) {
        await pool.query(
          'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES ($1, $2, $3, $4)',
          [salaryId, oxoSalaryId, excelData.oxoInternationalSalary, 'earning']
        );
        log.debug({ amount: excelData.oxoInternationalSalary, salaryId }, 'Inserted OXO International Salary slip detail');
      } else {
        log.error({ salaryId, amount: excelData.oxoInternationalSalary }, 'OXO International Salary component ID is null');
      }
    } else {
      log.warn({ amount: excelData.oxoInternationalSalary }, 'OXO International Salary not inserted (amount <= 0)');
    }

    // Insert Full Salary as calculated (Local + OXO) - optional, for display purposes
    if (fullSalaryId && fullSalary > 0) {
      await pool.query(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES ($1, $2, $3, $4)',
        [salaryId, fullSalaryId, fullSalary, 'earning']
      );
    }

    // Insert slip details for deductions
    if (epfId && epfDeduction > 0) {
      await pool.query(
        'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES ($1, $2, $3, $4)',
        [salaryId, epfId, epfDeduction, 'deduction']
      );
    }

    // Insert Allowances (if provided and > 0)
    if (excelData.allowances && excelData.allowances > 0) {
      // Get or create Allowances component
      const allowancesComponent = await pool.query(
        "SELECT id FROM salary_components WHERE name = 'Allowances'"
      );
      let allowancesId = (allowancesComponent.rows as any[])[0]?.id;

      if (!allowancesId) {
        const insertResult = await pool.query(
          "INSERT INTO salary_components (name, type, is_default, is_active) VALUES ('Allowances', 'earning', false, true) RETURNING id"
        );
        allowancesId = (insertResult.rows[0] as any).id;
        log.info({ allowancesId }, 'Created Allowances component');
      }

      if (allowancesId) {
        await pool.query(
          'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES ($1, $2, $3, $4)',
          [salaryId, allowancesId, excelData.allowances, 'earning']
        );
        log.debug({ amount: excelData.allowances, salaryId }, 'Inserted Allowances slip detail');
      }
    }

    // Insert Salary Advance/Deductions (if provided and > 0)
    if (excelData.salaryAdvanceDeductions && excelData.salaryAdvanceDeductions > 0) {
      // Get or create Salary Advance/Deductions component
      const deductionsComponent = await pool.query(
        "SELECT id FROM salary_components WHERE name = 'Salary Advance/Deductions'"
      );
      let deductionsId = (deductionsComponent.rows as any[])[0]?.id;

      if (!deductionsId) {
        const insertResult = await pool.query(
          "INSERT INTO salary_components (name, type, is_default, is_active) VALUES ('Salary Advance/Deductions', 'deduction', false, true) RETURNING id"
        );
        deductionsId = (insertResult.rows[0] as any).id;
        log.info({ deductionsId }, 'Created Salary Advance/Deductions component');
      }

      if (deductionsId) {
        await pool.query(
          'INSERT INTO salary_slip_details (salary_id, component_id, amount, type) VALUES ($1, $2, $3, $4)',
          [salaryId, deductionsId, excelData.salaryAdvanceDeductions, 'deduction']
        );
        log.debug({ amount: excelData.salaryAdvanceDeductions, salaryId }, 'Inserted Salary Advance/Deductions slip detail');
      }
    }

    const createdSalary = await this.findById(salaryId);
    if (!createdSalary) {
      throw new Error('Failed to create salary record');
    }
    return createdSalary;
  }
}
