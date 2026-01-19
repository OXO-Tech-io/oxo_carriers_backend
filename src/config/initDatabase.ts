import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { calculateProRatedAnnualLeave } from '../utils/leaveCalculation';

dotenv.config();

export const initializeDatabase = async (): Promise<void> => {
  let connection: mysql.Connection | null = null;
  let dbConnection: mysql.Connection | null = null;

  try {
    console.log('🔄 Initializing database...');

    const dbName = process.env.DB_NAME || 'hris_payroll';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbUser = process.env.DB_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD || '';
    const dbPort = parseInt(process.env.DB_PORT || '3306');

    // Step 1: Connect to MySQL server (without specifying database)
    console.log(`📡 Connecting to MySQL server at ${dbHost}:${dbPort}...`);
    connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      port: dbPort,
      multipleStatements: true,
    });
    console.log('✅ Connected to MySQL server');

    // Step 2: Create database if it doesn't exist
    console.log(`📦 Creating database '${dbName}' if it doesn't exist...`);
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`✅ Database '${dbName}' is ready`);
    } catch (error: any) {
      console.error(`❌ Failed to create database: ${error.message}`);
      throw error;
    }

    // Step 3: Connect to the specific database
    console.log(`🔌 Connecting to database '${dbName}'...`);
    dbConnection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      port: dbPort,
      multipleStatements: true,
    });
    console.log(`✅ Connected to database '${dbName}'`);

    // Step 4: Create all tables
    await createTablesManually(dbConnection);

    // Step 5: Insert default data
    await insertDefaultData(dbConnection);

    // Step 6: Verify tables were created
    await verifyTables(dbConnection);

    console.log('✅ Database initialization completed successfully!');
  } catch (error: any) {
    console.error('❌ Database initialization failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   SQL Error: ${error.sqlMessage}`);
    }
    
    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Troubleshooting tips:');
      console.error('   1. Make sure MySQL server is running');
      console.error('   2. Check your database credentials in .env file');
      console.error('   3. Verify MySQL user has CREATE DATABASE privileges');
    }
    
    throw error; // Re-throw to prevent server from starting with broken DB
  } finally {
    if (dbConnection) {
      await dbConnection.end();
    }
    if (connection) {
      await connection.end();
    }
  }
};

const verifyTables = async (connection: mysql.Connection): Promise<void> => {
  try {
    const [tables]: any = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    const expectedTables = [
      'users',
      'leave_types',
      'employee_leave_balance',
      'leave_requests',
      'salary_components',
      'employee_salary_structure',
      'monthly_salaries',
      'salary_slip_details',
      'audit_logs'
    ];

    const existingTables = tables.map((t: any) => t.TABLE_NAME);
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      console.warn(`⚠️  Missing tables: ${missingTables.join(', ')}`);
    } else {
      console.log(`✅ Verified: All ${expectedTables.length} tables exist`);
    }
  } catch (error: any) {
    console.warn('⚠️  Could not verify tables:', error.message);
  }
};

const createTablesManually = async (connection: mysql.Connection): Promise<void> => {
  console.log('📋 Creating tables...');

  // Disable foreign key checks temporarily
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');

  // Create users table first (no dependencies)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        employee_id VARCHAR(50) UNIQUE,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email_verified BOOLEAN DEFAULT false,
        email_verification_token VARCHAR(255),
        role ENUM('hr_manager', 'hr_executive', 'employee') NOT NULL,
        department VARCHAR(100),
        position VARCHAR(100),
        hire_date DATE,
        manager_id INT,
        must_change_password BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ users table');
  } catch (error: any) {
    console.error('  ✗ Error creating users table:', error.message);
    throw error;
  }

  // Create leave_types table (no dependencies)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        max_days INT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ leave_types table');
  } catch (error: any) {
    console.error('  ✗ Error creating leave_types table:', error.message);
    throw error;
  }

  // Create salary_components table (no dependencies)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS salary_components (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        type ENUM('earning', 'deduction') NOT NULL,
        is_default BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ salary_components table');
  } catch (error: any) {
    console.error('  ✗ Error creating salary_components table:', error.message);
    throw error;
  }

  // Create employee_leave_balance (depends on users and leave_types)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_leave_balance (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        leave_type_id INT NOT NULL,
        total_days DECIMAL(5,2) DEFAULT 0,
        used_days DECIMAL(5,2) DEFAULT 0,
        remaining_days DECIMAL(5,2) DEFAULT 0,
        year YEAR NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_leave_year (user_id, leave_type_id, year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ employee_leave_balance table');
  } catch (error: any) {
    console.error('  ✗ Error creating employee_leave_balance table:', error.message);
    throw error;
  }

  // Create leave_requests (depends on users and leave_types)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        leave_type_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days DECIMAL(5,2) NOT NULL,
        is_half_day BOOLEAN DEFAULT false,
        half_day_period ENUM('morning', 'evening') NULL,
        reason TEXT,
        status ENUM('pending', 'team_leader_approved', 'hr_approved', 'rejected', 'cancelled') DEFAULT 'pending',
        team_leader_approval_date TIMESTAMP NULL,
        hr_approval_date TIMESTAMP NULL,
        rejection_reason TEXT,
        attachment_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ leave_requests table');
  } catch (error: any) {
    console.error('  ✗ Error creating leave_requests table:', error.message);
    throw error;
  }

  // Create employee_salary_structure (depends on users and salary_components)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_salary_structure (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        component_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        is_percentage BOOLEAN DEFAULT false,
        percentage_of VARCHAR(100),
        effective_date DATE NOT NULL,
        end_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (component_id) REFERENCES salary_components(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ employee_salary_structure table');
  } catch (error: any) {
    console.error('  ✗ Error creating employee_salary_structure table:', error.message);
    throw error;
  }

  // Create monthly_salaries (depends on users)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS monthly_salaries (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        month_year DATE NOT NULL,
        basic_salary DECIMAL(10,2) NOT NULL,
        local_salary DECIMAL(10,2) DEFAULT 0,
        oxo_international_salary DECIMAL(10,2) DEFAULT 0,
        total_earnings DECIMAL(10,2) NOT NULL,
        total_deductions DECIMAL(10,2) NOT NULL,
        net_salary DECIMAL(10,2) NOT NULL,
        status ENUM('generated', 'paid', 'pending') DEFAULT 'generated',
        generated_by INT,
        paid_date DATE,
        pdf_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY unique_user_month (user_id, month_year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ monthly_salaries table');
  } catch (error: any) {
    console.error('  ✗ Error creating monthly_salaries table:', error.message);
    throw error;
  }

  // Create salary_slip_details (depends on monthly_salaries and salary_components)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS salary_slip_details (
        id INT PRIMARY KEY AUTO_INCREMENT,
        salary_id INT NOT NULL,
        component_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        type ENUM('earning', 'deduction') NOT NULL,
        FOREIGN KEY (salary_id) REFERENCES monthly_salaries(id) ON DELETE CASCADE,
        FOREIGN KEY (component_id) REFERENCES salary_components(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ salary_slip_details table');
  } catch (error: any) {
    console.error('  ✗ Error creating salary_slip_details table:', error.message);
    throw error;
  }

  // Create audit_logs (depends on users)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(100),
        record_id INT,
        old_values JSON,
        new_values JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ audit_logs table');
  } catch (error: any) {
    console.error('  ✗ Error creating audit_logs table:', error.message);
    throw error;
  }

  // Add manager foreign key constraint after users table exists
  try {
    // Check if constraint already exists
    const [constraints]: any = await connection.query(`
      SELECT CONSTRAINT_NAME 
      FROM information_schema.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND CONSTRAINT_NAME = 'fk_manager'
    `);

    if (constraints.length === 0) {
      await connection.query(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_manager 
        FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('  ✓ manager foreign key constraint');
    } else {
      console.log('  ✓ manager foreign key constraint (already exists)');
    }
  } catch (error: any) {
    // Ignore if constraint already exists or other non-critical errors
    if (error.code !== 'ER_DUP_KEY' && error.code !== 'ER_CANT_CREATE_TABLE' && !error.message.includes('Duplicate key')) {
      console.warn('  ⚠ Warning adding manager FK:', error.message);
    }
  }

  // Re-enable foreign key checks
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  // Add new columns to monthly_salaries if they don't exist (for existing databases)
  try {
    const [columns]: any = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'monthly_salaries' 
      AND COLUMN_NAME IN ('local_salary', 'oxo_international_salary')
    `);
    
    const existingColumns = columns.map((c: any) => c.COLUMN_NAME);
    
    if (!existingColumns.includes('local_salary')) {
      await connection.query(`
        ALTER TABLE monthly_salaries 
        ADD COLUMN local_salary DECIMAL(10,2) DEFAULT 0 AFTER basic_salary
      `);
      console.log('  ✓ Added local_salary column to monthly_salaries');
    }
    
    if (!existingColumns.includes('oxo_international_salary')) {
      await connection.query(`
        ALTER TABLE monthly_salaries 
        ADD COLUMN oxo_international_salary DECIMAL(10,2) DEFAULT 0 AFTER local_salary
      `);
      console.log('  ✓ Added oxo_international_salary column to monthly_salaries');
    }
  } catch (error: any) {
    console.warn('  ⚠ Warning adding columns to monthly_salaries:', error.message);
  }

  console.log('✅ All tables created successfully');
};

const insertDefaultData = async (connection: mysql.Connection): Promise<void> => {
  try {
    console.log('📊 Inserting default data...');

    // Insert leave types
    const [leaveTypesResult]: any = await connection.query(`
      SELECT COUNT(*) as count FROM leave_types
    `);
    
    if (leaveTypesResult[0].count === 0) {
      await connection.query(`
        INSERT INTO leave_types (name, description, max_days, is_active) VALUES
        ('Annual', 'Annual/Paid Leave', 14, true),
        ('Casual', 'Casual Leave', 7, true),
        ('Maternity', 'Maternity Leave', 90, true),
        ('Sick', 'Sick Leave', 10, true)
      `);
      console.log('  ✓ Leave types inserted');
    } else {
      console.log('  ✓ Leave types already exist');
    }

    // Insert salary components
    const [componentsResult]: any = await connection.query(`
      SELECT COUNT(*) as count FROM salary_components
    `);
    
    if (componentsResult[0].count === 0) {
      await connection.query(`
        INSERT INTO salary_components (name, type, is_default, is_active) VALUES
        ('Basic Salary', 'earning', true, true),
        ('Full Salary', 'earning', false, true),
        ('Local Salary', 'earning', false, true),
        ('OXO International Salary', 'earning', false, true),
        ('House Rent Allowance', 'earning', true, true),
        ('Transport Allowance', 'earning', true, true),
        ('Medical Allowance', 'earning', true, true),
        ('Provident Fund', 'deduction', true, true),
        ('Tax Deduction', 'deduction', true, true),
        ('Late Attendance', 'deduction', false, true)
      `);
      console.log('  ✓ Salary components inserted');
    } else {
      console.log('  ✓ Salary components already exist');
    }

    // Insert dummy user
    const [existingUser]: any = await connection.query(`
      SELECT id FROM users WHERE email = ?
    `, ['nimshan@gmail.com']);
    
    if (existingUser.length === 0) {
      const hashedPassword = await bcrypt.hash('Nimshan@12', 10);
      const employeeId = 'EMP' + String(Date.now()).slice(-6);
      const hireDate = new Date(); // Current date as hire date
      
      const [userResult]: any = await connection.query(`
        INSERT INTO users (employee_id, email, password, first_name, last_name, role, department, position, hire_date, email_verified, must_change_password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true, false)
      `, [
        employeeId,
        'nimshan@gmail.com',
        hashedPassword,
        'Nimshan',
        'User',
        'employee',
        'IT',
        'Software Developer',
        hireDate
      ]);

      const userId = userResult.insertId;
      console.log(`  ✓ Dummy user created: nimshan@gmail.com (ID: ${userId})`);

      // Initialize leave balances for the dummy user
      const currentYear = new Date().getFullYear();
      const [leaveTypes]: any = await connection.query(`
        SELECT id, name, max_days FROM leave_types WHERE is_active = true
      `);

      for (const type of leaveTypes) {
        let totalDays = type.max_days;
        
        // Apply pro-rated calculation for Annual leave in the first year
        if (type.name.toLowerCase() === 'annual' || type.name.toLowerCase() === 'annual/paid leave') {
          totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
        }

        await connection.query(`
          INSERT INTO employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year)
          VALUES (?, ?, ?, 0, ?, ?)
        `, [userId, type.id, totalDays, totalDays, currentYear]);
      }

      console.log('  ✓ Leave balances initialized for dummy user');
    } else {
      console.log('  ✓ Dummy user already exists');
    }

    console.log('✅ Default data ready');
  } catch (error: any) {
    console.error('⚠️  Warning inserting default data:', error.message);
    // Don't throw - default data is not critical for startup
  }
};
