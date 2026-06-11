import * as fs from 'fs';
import * as path from 'path';

// Import templates
import { getSetupPasswordEmailHtml, getPasswordResetEmailHtml, getEmailVerificationEmailHtml, getWelcomeCredentialsEmailHtml } from '../templates/authTemplates';
import { getLeaveSubmittedEmailHtml, getLeaveApprovedEmailHtml, getLeaveRejectedEmailHtml } from '../templates/leaveTemplates';
import { getMedicalClaimSubmittedHtml, getMedicalClaimApprovedHtml, getMedicalClaimRejectedHtml } from '../templates/medicalTemplates';
import { getPayslipAvailableHtml } from '../templates/payslipTemplate';
import { getVoucherApprovedHtml, getVoucherRejectedHtml } from '../templates/voucherTemplates';

const OUTPUT_DIR = path.join(__dirname, '..', 'templates', 'compiled');

// Mock Data
const employee = {
  name: 'Jane Doe',
  id: 'EMP-0482',
  email: 'jane.doe@oxocareers.com'
};

const templates = [
  // 1. Leave Templates
  {
    filename: 'leave_submitted.html',
    html: getLeaveSubmittedEmailHtml({
      employeeName: employee.name,
      leaveType: 'Annual Leave',
      startDate: '2026-06-15',
      endDate: '2026-06-19',
      totalDays: 5,
      reason: 'Annual family vacation and rest.',
      submittedDate: '2026-06-11',
      referenceNumber: 'LV-2026-8941',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/leaves/request/LV-2026-8941'
    })
  },
  {
    filename: 'leave_approved.html',
    html: getLeaveApprovedEmailHtml({
      employeeName: employee.name,
      leaveType: 'Annual Leave',
      startDate: '2026-06-15',
      endDate: '2026-06-19',
      totalDays: 5,
      approvedDate: '2026-06-11',
      approvedBy: 'Robert Chen (HR Manager)',
      remainingBalance: 16,
      referenceNumber: 'LV-2026-8941',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/leaves'
    })
  },
  {
    filename: 'leave_rejected.html',
    html: getLeaveRejectedEmailHtml({
      employeeName: employee.name,
      leaveType: 'Annual Leave',
      startDate: '2026-06-15',
      endDate: '2026-06-19',
      totalDays: 5,
      rejectionReason: 'Rejection due to crucial system migration during this week. Please reschedule after the release on June 25th.',
      referenceNumber: 'LV-2026-8941',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/leaves'
    })
  },

  // 2. Medical Claims Templates
  {
    filename: 'medical_submitted.html',
    html: getMedicalClaimSubmittedHtml({
      employeeName: employee.name,
      claimId: 'CLM-90284',
      claimType: 'Outpatient Dental Care',
      claimAmount: '$240.00',
      submissionDate: '2026-06-11',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/medical-claims/CLM-90284'
    })
  },
  {
    filename: 'medical_approved.html',
    html: getMedicalClaimApprovedHtml({
      employeeName: employee.name,
      claimId: 'CLM-90284',
      claimType: 'Outpatient Dental Care',
      claimAmount: '$240.00',
      approvedAmount: '$240.00',
      approvalDate: '2026-06-11',
      settlementInfo: 'Direct deposit to bank account ending in **5678',
      processingTimeline: '2-3 Business Days',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/medical-claims'
    })
  },
  {
    filename: 'medical_rejected.html',
    html: getMedicalClaimRejectedHtml({
      employeeName: employee.name,
      claimId: 'CLM-90284',
      claimType: 'Outpatient Dental Care',
      claimAmount: '$240.00',
      rejectionReason: 'Attached receipt does not contain itemized treatment charges or procedure codes.',
      requiredCorrections: 'Please scan and upload an itemized tax invoice showing separate treatment codes, patient name, and clinic details.',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/medical-claims'
    })
  },

  // 3. Payslip Templates
  {
    filename: 'payslip_available.html',
    html: getPayslipAvailableHtml({
      employeeName: employee.name,
      payPeriod: 'May 2026',
      netSalary: '$4,850.00',
      basicSalary: '$4,200.00',
      allowances: '$1,000.00',
      grossEarnings: '$5,200.00',
      taxDeductions: '$250.00',
      otherDeductions: '$100.00',
      totalDeductions: '$350.00',
      downloadUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/salaries'
    })
  },

  // 4. Voucher Templates
  {
    filename: 'voucher_approved.html',
    html: getVoucherApprovedHtml({
      employeeName: employee.name,
      voucherNumber: 'VCH-8491-01',
      voucherType: 'Wellness & Gym Membership',
      approvedAmount: '$75.00',
      expiryDate: '2026-12-31',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/vouchers'
    })
  },
  {
    filename: 'voucher_rejected.html',
    html: getVoucherRejectedHtml({
      employeeName: employee.name,
      voucherType: 'High-End Electronics Purchase',
      requestedAmount: '$150.00',
      rejectionReason: 'Electronics category vouchers are restricted to employees with 1+ years of tenure.',
      resubmissionInstructions: 'You are eligible to submit requests for Wellness or Meal vouchers. Please verify tenure requirements before submitting alternative requests.',
      ctaUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/vouchers'
    })
  },

  // 5. Auth / Onboarding Templates
  {
    filename: 'auth_setup_password.html',
    html: getSetupPasswordEmailHtml({
      name: employee.name,
      employeeId: employee.id,
      setupLink: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/reset-password?token=setup_mock_token_123',
      expiry: '7 days'
    })
  },
  {
    filename: 'auth_password_reset.html',
    html: getPasswordResetEmailHtml({
      name: employee.name,
      resetLink: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/reset-password?token=reset_mock_token_456',
      expiry: '1 hour'
    })
  },
  {
    filename: 'auth_email_verification.html',
    html: getEmailVerificationEmailHtml({
      name: employee.name,
      verificationLink: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/verify-email?token=verify_mock_token_789',
      expiry: '24 hours'
    })
  },
  {
    filename: 'auth_welcome_credentials.html',
    html: getWelcomeCredentialsEmailHtml({
      name: employee.name,
      employeeId: employee.id,
      password: 'TempPass987!',
      loginUrl: 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/login',
      button_text: 'Go to Employee Portal'
    })
  }
];

const run = () => {
  console.log('🚀 Starting email templates compilation...');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log(`Creating directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Compile each template
  templates.forEach((template) => {
    const filePath = path.join(OUTPUT_DIR, template.filename);
    fs.writeFileSync(filePath, template.html, 'utf8');
    console.log(`✅ Compiled: ${template.filename} -> ${filePath}`);
  });

  console.log('🎉 Email templates compilation completed successfully!');
};

run();
