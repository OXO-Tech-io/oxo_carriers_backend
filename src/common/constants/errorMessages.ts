/**
 * Error Messages and Status Codes
 * Centralized constants for consistent error handling across the application
 */

// HTTP Status Codes
export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
} as const;

// Generic Error Messages
export const ERROR_MESSAGES = {
    // Authentication & Authorization
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',

    // Generic CRUD
    NOT_FOUND: 'Resource not found',
    FAILED_TO_CREATE: 'Failed to create resource',
    FAILED_TO_UPDATE: 'Failed to update resource',
    FAILED_TO_DELETE: 'Failed to delete resource',
    FAILED_TO_FETCH: 'Failed to fetch data',

    // Validation
    INVALID_INPUT: 'Invalid input',
    BAD_REQUEST: 'Bad request',
    VALIDATION_FAILED: 'Validation failed',
    INTERNAL_SERVER_ERROR: 'Internal server error',

    // Route
    ROUTE_NOT_FOUND: 'Route not found',
} as const;

// User-specific Error Messages
export const USER_ERRORS = {
    NOT_FOUND: 'User not found',
    FAILED_TO_CREATE: 'Failed to create user',
    FAILED_TO_CREATE_FROM_KEYCLOAK: 'Failed to create user from Keycloak claims',
    INVALID_USER_ID: 'Invalid user ID',
    FAILED_TO_FETCH: 'Failed to fetch users',
} as const;

// Voucher-specific Error Messages
export const VOUCHER_ERRORS = {
    NOT_FOUND: 'Voucher not found',
    FAILED_TO_CREATE: 'Failed to create voucher',
    VENDOR_AND_AMOUNT_REQUIRED: 'Vendor and Amount are required',
    INVALID_AMOUNT: 'Invalid amount',
    NOT_PENDING_REVIEW: 'Voucher is not pending review',
    INVALID_ACTION: 'Invalid action',
    ONLY_INFORMATION_REQUEST_CAN_RESUBMIT: 'Only Information Request vouchers can be resubmitted',
    ONLY_APPROVED_CAN_BANK_UPLOAD: 'Only Approved vouchers can be marked as Bank Upload',
    ONLY_BANK_UPLOAD_CAN_MARK_PAID: 'Only Bank Upload vouchers can be marked as Paid',
    INSUFFICIENT_PERMISSION_CREATE: 'Forbidden: insufficient permission to create vouchers',
    INSUFFICIENT_PERMISSION_REVIEW: 'Forbidden: insufficient permission to review vouchers',
    INSUFFICIENT_PERMISSION_RESUBMIT: 'Forbidden: insufficient permission to resubmit vouchers',
    INSUFFICIENT_PERMISSION_BANK_UPLOAD: 'Forbidden: insufficient permission to mark bank upload',
    INSUFFICIENT_PERMISSION_MARK_PAID: 'Forbidden: insufficient permission to mark paid',
} as const;

// Leave-specific Error Messages
export const LEAVE_ERRORS = {
    NOT_FOUND: 'Leave request not found',
    FAILED_TO_CREATE: 'Failed to create leave request',
    INVALID_DATE_RANGE: 'Invalid date range',
    HALF_DAY_SAME_DATE: 'Half-day leave requires start_date and end_date to be the same',
    HALF_DAY_PERIOD_REQUIRED: 'half_day_period is required when is_half_day is true',
} as const;

// Leave Calendar Error Messages
export const LEAVE_CALENDAR_ERRORS = {
    NOT_FOUND: 'Calendar entry not found',
    FAILED_TO_CREATE: 'Failed to create leave calendar entry',
    FAILED_TO_UPDATE: 'Failed to update leave calendar entry',
    FAILED_TO_DELETE: 'Failed to delete calendar entry',
    FAILED_TO_FETCH: 'Failed to fetch calendar entries',
    FAILED_TO_GET_HOLIDAY_COUNT: 'Failed to get holiday count',
    FAILED_TO_CHECK_HOLIDAY: 'Failed to check holiday',
    DATE_AND_NAME_REQUIRED: 'Date and name are required',
    START_AND_END_DATE_REQUIRED: 'Start date and end date are required',
    HOLIDAY_ALREADY_EXISTS: 'A holiday already exists for this date',
    DATE_REQUIRED: 'Date is required',
} as const;

// Facility-specific Error Messages
export const FACILITY_ERRORS = {
    NOT_FOUND: 'Facility not found',
    FAILED_TO_CREATE: 'Failed to create facility',
    BOOKING_NOT_FOUND: 'Booking not found',
    MISSING_REQUIRED_BOOKING_FIELDS: 'Missing required booking fields',
    FAILED_TO_CREATE_BOOKING: 'Failed to create booking',
    NOT_AVAILABLE: 'Facility is not available for the selected time slot',
    QUERY_PARAMS_REQUIRED: 'Query params type, start_time and end_time are required',
    INVALID_START_OR_END_TIME: 'Invalid start_time or end_time',
} as const;

// Salary-specific Error Messages
export const SALARY_ERRORS = {
    FAILED_TO_CREATE: 'Failed to create salary record',
    FAILED_TO_FETCH_COMPONENTS: 'Failed to fetch salary components',
} as const;

// Medical Insurance Error Messages
export const MEDICAL_INSURANCE_ERRORS = {
    NOT_FOUND: 'Claim not found',
    FAILED_TO_CREATE: 'Failed to create medical insurance claim',
    FAILED_TO_SUBMIT: 'Failed to submit claim',
    FAILED_TO_FETCH: 'Failed to fetch claims',
    FAILED_TO_APPROVE: 'Failed to approve claim',
    FAILED_TO_REJECT: 'Failed to reject claim',
    FAILED_TO_RESUBMIT: 'Failed to resubmit claim',
    FAILED_TO_GET_LIMITS: 'Failed to get limits',
    TYPE_MUST_BE_IN_OR_OPD: 'Type must be IN or OPD',
    VALID_AMOUNT_REQUIRED: 'Valid amount is required',
    SUPPORTIVE_DOCUMENT_REQUIRED: 'Supportive document is required',
    NOT_PENDING: 'Claim is not pending',
    ADMIN_COMMENT_REQUIRED: 'Admin comment is required for rejection',
    ONLY_REJECTED_CAN_RESUBMIT: 'Only rejected claims can be resubmitted',
    SUPPORTIVE_DOCUMENT_REQUIRED_FOR_RESUBMISSION: 'Supportive document is required for resubmission',
    ONLY_HR_CAN_APPROVE: 'Only HR can approve medical claims',
    ONLY_HR_CAN_REJECT: 'Only HR can reject medical claims',
} as const;

// Consultant Submission Error Messages
export const CONSULTANT_SUBMISSION_ERRORS = {
    NOT_FOUND: 'Submission not found',
    FAILED_TO_CREATE: 'Failed to create consultant work submission',
    FAILED_TO_SUBMIT: 'Failed to submit work',
    FAILED_TO_FETCH: 'Failed to fetch submissions',
    FAILED_TO_APPROVE: 'Failed to approve',
    FAILED_TO_REJECT: 'Failed to reject',
    FAILED_TO_RESUBMIT: 'Failed to resubmit',
    ONLY_CONSULTANTS_CAN_SUBMIT: 'Only consultants can submit work',
    PROJECT_TECH_HOURS_REQUIRED: 'Project, tech, and total hours are required',
    TOTAL_HOURS_GREATER_THAN_ZERO: 'Total hours must be greater than 0',
    LOG_SHEET_REQUIRED: 'Log sheet (Excel) is required',
    NOT_PENDING: 'Submission is not pending',
    ONLY_HR_CAN_APPROVE: 'Only HR can approve consultant submissions',
    ONLY_HR_CAN_REJECT: 'Only HR can reject consultant submissions',
    ADMIN_COMMENT_REQUIRED: 'Admin comment is required for rejection',
    ONLY_CONSULTANTS_CAN_RESUBMIT: 'Only consultants can resubmit',
    ONLY_REJECTED_CAN_RESUBMIT: 'Only rejected submissions can be resubmitted',
    LOG_SHEET_REQUIRED_FOR_RESUBMISSION: 'Log sheet (Excel) is required for resubmission',
} as const;

// Permission Error Messages
export const PERMISSION_ERRORS = {
    FAILED_TO_FETCH: 'Failed to fetch permissions',
    FAILED_TO_FETCH_USER_PERMISSIONS: 'Failed to fetch user permissions',
    FAILED_TO_FETCH_PERMISSION_ASSIGNMENTS: 'Failed to fetch permission assignments',
    PERMISSIONS_MUST_BE_ARRAY: 'permissions must be an array',
    EACH_PERMISSION_MUST_BE_OBJECT: 'Each permission must be an object with key and accessLevel',
} as const;

// Vendor Error Messages
export const VENDOR_ERRORS = {
    FAILED_TO_CREATE: 'Failed to create vendor',
} as const;

// Email Error Messages
export const EMAIL_ERRORS = {
    FAILED_TO_SEND_TEST: 'Failed to send test email via EmailJS. Check logs.',
    ERROR_SENDING_TEST: 'Error sending test email',
} as const;

// CORS Error Messages
export const CORS_ERRORS = {
    ORIGIN_NOT_ALLOWED: (origin: string) => `Origin ${origin} not allowed by CORS`,
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',

    // Facility
    FACILITY_DELETED: 'Facility deleted successfully',
    BOOKING_CANCELLED: 'Booking cancelled',

    // Leave Calendar
    CALENDAR_ENTRY_CREATED: 'Calendar entry created successfully',
    CALENDAR_ENTRY_UPDATED: 'Calendar entry updated successfully',
    CALENDAR_ENTRY_DELETED: 'Calendar entry deleted successfully',

    // Medical Insurance
    MEDICAL_CLAIM_SUBMITTED: 'Medical insurance claim submitted',
    CLAIM_APPROVED: 'Claim approved',
    CLAIM_REJECTED: 'Claim rejected',
    CLAIM_RESUBMITTED: 'Claim resubmitted',

    // Consultant Submissions
    WORK_SUBMISSION_CREATED: 'Work submission created',
    SUBMISSION_APPROVED: 'Submission approved',
    SUBMISSION_REJECTED: 'Submission rejected',
    WORK_RESUBMITTED: 'Work resubmitted',

    // Leave
    LEAVE_REQUEST_CREATED: 'Leave request created',
    LEAVE_REQUEST_UPDATED: 'Leave request updated',
    LEAVE_REQUEST_REJECTED: 'Leave request rejected',
} as const;

export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
