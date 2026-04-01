export enum UserRole {
  HR_MANAGER = 'hr_manager',
  HR_EXECUTIVE = 'hr_executive',
  FINANCE_MANAGER = 'finance_manager',
  FINANCE_EXECUTIVE = 'finance_executive',
  PAYMENT_APPROVER = 'payment_approver',
  EMPLOYEE = 'employee',
  CONSULTANT = 'consultant',
  SERVICE_PROVIDER = 'service_provider'
}

export enum VoucherStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  INFORMATION_REQUEST = 'information_request',
  BANK_UPLOAD = 'bank_upload',
  PAID = 'paid'
}

export interface Vendor {
  id: number;
  email: string;
  company_name: string;
  contact_number?: string | null;
  bank_name?: string | null;
  account_holder_name?: string | null;
  account_number?: string | null;
  bank_branch?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentVoucher {
  id: number;
  voucher_number: string;
  created_by: number;
  vendor_id: number;
  amount: number;
  vat: number;
  description: string | null;
  invoice_url: string | null;
  status: VoucherStatus;
  executive_comment: string | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  resubmitted_at: Date | null;
  bank_upload_by: number | null;
  bank_upload_at: Date | null;
  paid_by: number | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
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
  hourly_rate?: number | null;
  bank_name?: string | null;
  account_holder_name?: string | null;
  account_number?: string | null;
  bank_branch?: string | null;
  company_name?: string | null;
  contact_number?: string | null;
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

export interface LeaveCalendar {
  id: number;
  date: Date;
  name: string;
  description?: string;
  is_recurring: boolean;
  year?: number;
  created_by?: number;
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

export enum FacilityType {
  WORKSTATION = 'workstation',
  BOARD_ROOM = 'board_room',
  MEETING_ROOM = 'meeting_room',
  ACCOMMODATION = 'accommodation'
}

export interface Facility {
  id: number;
  name: string;
  type: FacilityType;
  description?: string;
  facilities?: string;
  capacity?: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed'
}

export interface FacilityBooking {
  id: number;
  facility_id: number;
  user_id: number;
  start_time: Date;
  end_time: Date;
  purpose?: string;
  status: BookingStatus;
  created_at: Date;
  updated_at: Date;
}

export enum MedicalClaimType {
  IN = 'IN',
  OPD = 'OPD'
}

export enum MedicalClaimStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export interface MedicalInsuranceClaim {
  id: number;
  user_id: number;
  type: MedicalClaimType;
  quarter: string;
  amount: number;
  status: MedicalClaimStatus;
  supportive_document_url: string;
  relevant_document_url?: string | null;
  admin_comment?: string | null;
  reviewed_by?: number | null;
  reviewed_at?: Date | null;
  resubmission_of?: number | null;
  created_at: Date;
  updated_at: Date;
  user?: { id: number; first_name: string; last_name: string; email: string; employee_id: string };
}

export enum ConsultantSubmissionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export interface ConsultantWorkSubmission {
  id: number;
  user_id: number;
  project: string;
  tech: string;
  total_hours: number;
  comment?: string | null;
  log_sheet_url: string;
  status: ConsultantSubmissionStatus;
  admin_comment?: string | null;
  reviewed_by?: number | null;
  reviewed_at?: Date | null;
  resubmission_of?: number | null;
  created_at: Date;
  updated_at: Date;
  user?: { id: number; first_name: string; last_name: string; email: string; employee_id: string; hourly_rate?: number | null };
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
}

import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}
