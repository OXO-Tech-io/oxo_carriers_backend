export enum UserRole {
  HR_MANAGER = 'hr_manager',
  HR_EXECUTIVE = 'hr_executive',
  EMPLOYEE = 'employee'
}

export enum LeaveStatus {
  PENDING = 'pending',
  TEAM_LEADER_APPROVED = 'team_leader_approved',
  HR_APPROVED = 'hr_approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

export enum SalaryStatus {
  GENERATED = 'generated',
  PAID = 'paid',
  PENDING = 'pending'
}

export enum ComponentType {
  EARNING = 'earning',
  DEDUCTION = 'deduction'
}

export interface User {
  id: number;
  employee_id: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  department?: string;
  position?: string;
  hire_date?: Date;
  manager_id?: number;
  must_change_password: boolean;
  email_verified?: boolean;
  email_verification_token?: string;
  created_at: Date;
  updated_at: Date;
}

export interface LeaveType {
  id: number;
  name: string;
  description?: string;
  max_days: number;
  is_active: boolean;
  created_at: Date;
}

export interface LeaveBalance {
  id: number;
  user_id: number;
  leave_type_id: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
  year: number;
  leave_type: LeaveType;
  created_at?: Date;
  updated_at?: Date;
}

export interface LeaveRequest {
  id: number;
  user_id: number;
  leave_type_id: number;
  start_date: Date;
  end_date: Date;
  total_days: number;
  is_half_day?: boolean;
  half_day_period?: 'morning' | 'evening';
  reason?: string;
  status: LeaveStatus;
  team_leader_approval_date?: Date;
  hr_approval_date?: Date;
  rejection_reason?: string;
  attachment_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SalaryComponent {
  id: number;
  name: string;
  type: ComponentType;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
}

export interface EmployeeSalaryStructure {
  id: number;
  user_id: number;
  component_id: number;
  amount: number;
  is_percentage: boolean;
  percentage_of?: string;
  effective_date: Date;
  end_date?: Date;
  created_at: Date;
}

export interface EmployeeSalaryStructureWithComponent extends EmployeeSalaryStructure {
  component_name: string;
  component_type: ComponentType;
}

export interface MonthlySalary {
  id: number;
  user_id: number;
  month_year: Date;
  basic_salary: number;
  local_salary?: number;
  oxo_international_salary?: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  status: SalaryStatus;
  generated_by?: number;
  paid_date?: Date;
  pdf_url?: string;
  created_at: Date;
}

export interface SalarySlipDetail {
  id: number;
  salary_id: number;
  component_id: number;
  amount: number;
  type: ComponentType;
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}
