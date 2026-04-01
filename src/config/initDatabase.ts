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
    // This is optional - on some servers, we only have access to a specific database
    console.log(`📡 Connecting to MySQL server at ${dbHost}:${dbPort}...`);
    try {
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
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`✅ Database '${dbName}' is ready`);
    } catch (error: any) {
      console.warn(`⚠️  Notice: Optional database creation skipped/failed: ${error.message}`);
      console.log('   Continuing to step 3 to connect to pre-existing database...');
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
      'audit_logs',
      'facilities',
      'facility_bookings',
      'medical_insurance_claims',
      'consultant_work_submissions'
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

  // Create leave_calendar (holidays/public holidays)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leave_calendar (
        id INT PRIMARY KEY AUTO_INCREMENT,
        date DATE NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        is_recurring BOOLEAN DEFAULT false,
        year INT NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_date (date),
        INDEX idx_year (year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ leave_calendar table');
  } catch (error: any) {
    console.error('  ✗ Error creating leave_calendar table:', error.message);
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

  // Create facilities table
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS facilities (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        type ENUM('workstation', 'board_room', 'meeting_room', 'accommodation') NOT NULL,
        description TEXT,
        facilities TEXT,
        capacity INT DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ facilities table');
  } catch (error: any) {
    console.error('  ✗ Error creating facilities table:', error.message);
    throw error;
  }

  // Create facility_bookings table
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS facility_bookings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        facility_id INT NOT NULL,
        user_id INT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        purpose TEXT,
        status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'confirmed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ facility_bookings table');
  } catch (error: any) {
    console.error('  ✗ Error creating facility_bookings table:', error.message);
    throw error;
  }

  // Create medical_insurance_claims table
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS medical_insurance_claims (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        type ENUM('IN', 'OPD') NOT NULL,
        quarter VARCHAR(10) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        supportive_document_url VARCHAR(500) NOT NULL,
        relevant_document_url VARCHAR(500) NULL,
        admin_comment TEXT NULL,
        reviewed_by INT NULL,
        reviewed_at TIMESTAMP NULL,
        resubmission_of INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (resubmission_of) REFERENCES medical_insurance_claims(id) ON DELETE SET NULL,
        INDEX idx_user_status (user_id, status),
        INDEX idx_quarter (quarter),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ medical_insurance_claims table');
  } catch (error: any) {
    console.error('  ✗ Error creating medical_insurance_claims table:', error.message);
    throw error;
  }

  // Migration: Add consultant/service_provider roles and hourly_rate to users
  try {
    await connection.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('hr_manager', 'hr_executive', 'finance_manager', 'finance_executive', 'payment_approver', 'employee', 'consultant', 'service_provider') NOT NULL
    `);
    console.log('  ✓ users.role ENUM updated (consultant, service_provider)');
  } catch (error: any) {
    if (error.code !== 'ER_INVALID_USE_OF_NULL' && !error.message?.includes('Duplicate')) {
      console.warn('  ⚠ users.role migration:', error.message);
    }
  }
  try {
    const [cols]: any = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'hourly_rate'
    `);
    if (!cols?.length) {
      await connection.query(`
        ALTER TABLE users ADD COLUMN hourly_rate DECIMAL(10,2) NULL AFTER position
      `);
      console.log('  ✓ users.hourly_rate column added');
    }
  } catch (error: any) {
    console.warn('  ⚠ users.hourly_rate migration:', error.message);
  }

  // Migration: Add bank details and service provider fields to users
  const userBankSpColumns = [
    { name: 'bank_name', def: 'VARCHAR(150) NULL', after: 'hourly_rate' },
    { name: 'account_holder_name', def: 'VARCHAR(150) NULL', after: 'bank_name' },
    { name: 'account_number', def: 'VARCHAR(80) NULL', after: 'account_holder_name' },
    { name: 'bank_branch', def: 'VARCHAR(150) NULL', after: 'account_number' },
    { name: 'company_name', def: 'VARCHAR(200) NULL', after: 'bank_branch' },
    { name: 'contact_number', def: 'VARCHAR(30) NULL', after: 'company_name' },
  ];
  for (const col of userBankSpColumns) {
    try {
      const [cols]: any = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?
      `, [col.name]);
      if (!cols?.length) {
        await connection.query(`
          ALTER TABLE users ADD COLUMN \`${col.name}\` ${col.def} AFTER \`${col.after}\`
        `);
        console.log(`  ✓ users.${col.name} column added`);
      }
    } catch (error: any) {
      console.warn(`  ⚠ users.${col.name} migration:`, error.message);
    }
  }

  // Create consultant_work_submissions table
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS consultant_work_submissions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        project VARCHAR(255) NOT NULL,
        tech VARCHAR(255) NOT NULL,
        total_hours DECIMAL(10,2) NOT NULL,
        comment TEXT NULL,
        log_sheet_url VARCHAR(500) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        admin_comment TEXT NULL,
        reviewed_by INT NULL,
        reviewed_at TIMESTAMP NULL,
        resubmission_of INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (resubmission_of) REFERENCES consultant_work_submissions(id) ON DELETE SET NULL,
        INDEX idx_user_status (user_id, status),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ consultant_work_submissions table');
  } catch (error: any) {
    console.error('  ✗ Error creating consultant_work_submissions table:', error.message);
    throw error;
  }

  // Create vendors table (separate from users; no email verification)
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        company_name VARCHAR(200) NOT NULL,
        contact_number VARCHAR(30) NULL,
        bank_name VARCHAR(150) NULL,
        account_holder_name VARCHAR(150) NULL,
        account_number VARCHAR(80) NULL,
        bank_branch VARCHAR(150) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY vendors_email_unique (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  ✓ vendors table');
  } catch (error: any) {
    console.error('  ✗ Error creating vendors table:', error.message);
    throw error;
  }

  // Create payment_vouchers table (uses vendor_id -> vendors)
  try {
    const [pvExists]: any = await connection.query(`
      SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'payment_vouchers'
    `);
    if (!pvExists?.length) {
      await connection.query(`
        CREATE TABLE payment_vouchers (
          id INT PRIMARY KEY AUTO_INCREMENT,
          voucher_number VARCHAR(50) UNIQUE NOT NULL,
          created_by INT NOT NULL,
          vendor_id INT NOT NULL,
          amount DECIMAL(12,2) NOT NULL,
          vat DECIMAL(12,2) NOT NULL DEFAULT 0,
          description TEXT NULL,
          invoice_url VARCHAR(500) NULL,
          status ENUM('pending_review', 'approved', 'rejected', 'information_request', 'bank_upload', 'paid') NOT NULL DEFAULT 'pending_review',
          executive_comment TEXT NULL,
          reviewed_by INT NULL,
          reviewed_at TIMESTAMP NULL,
          resubmitted_at TIMESTAMP NULL,
          bank_upload_by INT NULL,
          bank_upload_at TIMESTAMP NULL,
          paid_by INT NULL,
          paid_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
          FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (bank_upload_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL,
          INDEX idx_status (status),
          INDEX idx_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✓ payment_vouchers table (vendor_id)');
    }
  } catch (error: any) {
    console.error('  ✗ Error creating payment_vouchers table:', error.message);
    throw error;
  }

  // Migration: payment_vouchers from service_provider_id (users) to vendor_id (vendors)
  try {
    const [cols]: any = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_vouchers'
    `);
    const columnNames = (cols || []).map((c: any) => c.COLUMN_NAME);
    if (columnNames.includes('service_provider_id') && !columnNames.includes('vendor_id')) {
      const [fkRows]: any = await connection.query(`
        SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_vouchers' AND COLUMN_NAME = 'service_provider_id' AND REFERENCED_TABLE_NAME IS NOT NULL
      `);
      const fkName = fkRows?.[0]?.CONSTRAINT_NAME;
      if (fkName) {
        await connection.query(`ALTER TABLE payment_vouchers DROP FOREIGN KEY \`${fkName}\``);
      }
      await connection.query(`
        INSERT INTO vendors (id, email, company_name, contact_number, bank_name, account_holder_name, account_number, bank_branch)
        SELECT id, email, COALESCE(company_name, first_name), contact_number, bank_name, account_holder_name, account_number, bank_branch
        FROM users WHERE role = 'service_provider'
      `);
      await connection.query(`ALTER TABLE payment_vouchers ADD COLUMN vendor_id INT NULL AFTER created_by`);
      await connection.query(`UPDATE payment_vouchers SET vendor_id = service_provider_id`);
      await connection.query(`ALTER TABLE payment_vouchers DROP COLUMN service_provider_id`);
      await connection.query(`ALTER TABLE payment_vouchers MODIFY vendor_id INT NOT NULL`);
      await connection.query(`
        ALTER TABLE payment_vouchers ADD CONSTRAINT fk_pv_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      `);
      if (!columnNames.includes('invoice_url')) {
        await connection.query(`ALTER TABLE payment_vouchers ADD COLUMN invoice_url VARCHAR(500) NULL AFTER description`);
      }
      console.log('  ✓ payment_vouchers migrated to vendor_id');
    }
  } catch (error: any) {
    console.warn('  ⚠ payment_vouchers vendor_id migration:', (error as Error).message);
  }

  // Migration: Add invoice_url to payment_vouchers (if missing)
  try {
    const [cols]: any = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_vouchers' AND COLUMN_NAME = 'invoice_url'
    `);
    if (!cols?.length) {
      await connection.query(`
        ALTER TABLE payment_vouchers ADD COLUMN invoice_url VARCHAR(500) NULL AFTER description
      `);
      console.log('  ✓ payment_vouchers.invoice_url column added');
    }
  } catch (error: any) {
    console.warn('  ⚠ payment_vouchers.invoice_url migration:', error.message);
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
        ('Maternity', 'Maternity Leave', 84, true)
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

    // Insert default facilities
    const [facilitiesResult]: any = await connection.query(`
      SELECT COUNT(*) as count FROM facilities
    `);
    
    if (facilitiesResult[0].count === 0) {
      await connection.query(`
        INSERT INTO facilities (name, type, description, facilities, capacity, is_active) VALUES
        ('Workstation A1', 'workstation', 'Standard office workstation', 'Monitor, Keyboard, Mouse, LAN', 1, true),
        ('Board Room 1', 'board_room', 'Executive board room for meetings', 'Projector, Whiteboard, Video Conference, AC', 12, true),
        ('Meeting Room Small', 'meeting_room', 'Small meeting room for quick gatherings', 'Whiteboard, AC', 4, true),
        ('Guest Room 101', 'accommodation', 'Comfortable accommodation for visitors', 'Bed, TV, AC, Attached Bathroom', 2, true)
      `);
      console.log('  ✓ Default facilities inserted');
    } else {
      console.log('  ✓ Facilities already exist');
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
