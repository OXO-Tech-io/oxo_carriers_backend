-- Database initialization script for OXO Carriers HRIS & Payroll
-- Generated from src/config/initDatabase.ts

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for users
-- ----------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id VARCHAR(50) UNIQUE,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  email_verification_token VARCHAR(255),
  role ENUM('hr_manager', 'hr_executive', 'finance_manager', 'finance_executive', 'payment_approver', 'employee', 'consultant', 'service_provider') NOT NULL,
  department VARCHAR(100),
  position VARCHAR(100),
  hourly_rate DECIMAL(10,2) NULL,
  bank_name VARCHAR(150) NULL,
  account_holder_name VARCHAR(150) NULL,
  account_number VARCHAR(80) NULL,
  bank_branch VARCHAR(150) NULL,
  company_name VARCHAR(200) NULL,
  contact_number VARCHAR(30) NULL,
  hire_date DATE,
  manager_id INT,
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for leave_types
-- ----------------------------
CREATE TABLE IF NOT EXISTS leave_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  max_days INT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for salary_components
-- ----------------------------
CREATE TABLE IF NOT EXISTS salary_components (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  type ENUM('earning', 'deduction') NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for employee_leave_balance
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for leave_requests
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for leave_calendar
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for employee_salary_structure
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for monthly_salaries
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for salary_slip_details
-- ----------------------------
CREATE TABLE IF NOT EXISTS salary_slip_details (
  id INT PRIMARY KEY AUTO_INCREMENT,
  salary_id INT NOT NULL,
  component_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  type ENUM('earning', 'deduction') NOT NULL,
  FOREIGN KEY (salary_id) REFERENCES monthly_salaries(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES salary_components(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for audit_logs
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for facilities
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for facility_bookings
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for medical_insurance_claims
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for consultant_work_submissions
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for vendors (separate from users; no email verification)
-- ----------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for payment_vouchers (vendor_id -> vendors)
-- ----------------------------
CREATE TABLE IF NOT EXISTS payment_vouchers (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Default data insertion
-- ----------------------------

-- Leave Types
INSERT INTO leave_types (name, description, max_days, is_active) VALUES
('Annual', 'Annual/Paid Leave', 14, true),
('Casual', 'Casual Leave', 7, true),
('Maternity', 'Maternity Leave', 84, true);

-- Salary Components
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
('Late Attendance', 'deduction', false, true);

-- Facilities
INSERT INTO facilities (name, type, description, facilities, capacity, is_active) VALUES
('Workstation A1', 'workstation', 'Standard office workstation', 'Monitor, Keyboard, Mouse, LAN', 1, true),
('Board Room 1', 'board_room', 'Executive board room for meetings', 'Projector, Whiteboard, Video Conference, AC', 12, true),
('Meeting Room Small', 'meeting_room', 'Small meeting room for quick gatherings', 'Whiteboard, AC', 4, true),
('Guest Room 101', 'accommodation', 'Comfortable accommodation for visitors', 'Bed, TV, AC, Attached Bathroom', 2, true);

-- Dummy User (Password: Nimshan@12)
INSERT INTO users (employee_id, email, password, first_name, last_name, role, department, position, hire_date, email_verified, must_change_password)
VALUES ('EMP001', 'nimshan@gmail.com', '$2b$10$yIHVuFsaLgOFbkkRtmux3e1OrbGAxbWeHSt9RjWLOR040OortDng.', 'Nimshan', 'User', 'employee', 'IT', 'Software Developer', CURDATE(), true, false);

-- Initialize Leave Balances for Dummy User (ID 1)
INSERT INTO employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year)
SELECT 
    (SELECT id FROM users WHERE email = 'nimshan@gmail.com'),
    id,
    CASE 
        WHEN name = 'Annual' THEN 14 -- Note: Simplification of pro-rated logic
        WHEN name = 'Casual' THEN 7
        WHEN name = 'Maternity' THEN 84
        ELSE max_days 
    END,
    0,
    CASE 
        WHEN name = 'Annual' THEN 14
        WHEN name = 'Casual' THEN 7
        WHEN name = 'Maternity' THEN 84
        ELSE max_days 
    END,
    YEAR(CURDATE())
FROM leave_types;

SET FOREIGN_KEY_CHECKS = 1;
