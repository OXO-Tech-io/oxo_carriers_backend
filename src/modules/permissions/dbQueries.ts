/**
 * Database Query Constants
 * Centralized SQL queries for consistent database operations
 */

// Permission Queries
// tbl_user_permissions.user_id was renamed to a business employee_id (varchar)
// FK referencing tbl_employee.employee_id - GET_ALL_USER_PERMISSIONS still
// joins back to tbl_employee to expose the numeric id (aliased as user_id)
// since every caller of that query keys its result by the numeric id.
export const PERMISSION_QUERIES = {
    GET_USER_PERMISSIONS: 'SELECT permission_key, access_level FROM tbl_user_permissions WHERE employee_id = $1',
    GET_ALL_USER_PERMISSIONS: `SELECT e.id AS user_id, p.permission_key, p.access_level
     FROM tbl_user_permissions p
     JOIN tbl_employee e ON e.employee_id = p.employee_id
     ORDER BY e.id`,
    CHECK_PERMISSION: `SELECT 1
     FROM tbl_user_permissions
     WHERE employee_id = $1
       AND permission_key = $2
       AND (
         access_level = 'write'
         OR ($3 = 'read' AND access_level = 'read')
       )
     LIMIT 1`,
} as const;

// Vendor Queries
export const VENDOR_QUERIES = {
    FIND_BY_EMAIL: 'SELECT * FROM tbl_vendors WHERE email = $1',
    FIND_BY_ID: 'SELECT * FROM tbl_vendors WHERE id = $1',
} as const;

// Leave Queries
export const LEAVE_QUERIES = {
    GET_ACTIVE_LEAVE_TYPES: 'SELECT * FROM tbl_leave_types WHERE is_active = true ORDER BY name',
    GET_LEAVE_TYPES_WITH_MAX_DAYS: 'SELECT id, name, max_days FROM tbl_leave_types WHERE is_active = true',
} as const;

// Leave Calendar Queries
export const LEAVE_CALENDAR_QUERIES = {
    // Commonly used queries for leave calendar operations
    FIND_BY_ID: 'SELECT * FROM tbl_leave_calendar WHERE id = $1',
    DELETE_BY_ID: 'DELETE FROM tbl_leave_calendar WHERE id = $1',
} as const;

// Facility Queries
export const FACILITY_QUERIES = {
    FIND_BY_ID: 'SELECT * FROM tbl_facilities WHERE id = $1',
    DELETE_BY_ID: 'DELETE FROM tbl_facilities WHERE id = $1',
} as const;

// Facility Booking Queries
export const FACILITY_BOOKING_QUERIES = {
    UPDATE_STATUS: 'UPDATE tbl_facility_bookings SET status = $1 WHERE id = $2',
    DELETE_BY_ID: 'DELETE FROM tbl_facility_bookings WHERE id = $1',
} as const;

// Salary Queries
export const SALARY_QUERIES = {
    GET_ACTIVE_COMPONENTS: 'SELECT * FROM tbl_salary_components WHERE is_active = true ORDER BY type, name',
    FIND_BY_ID: 'SELECT * FROM tbl_monthly_salaries WHERE id = $1',
    UPDATE_STATUS: 'UPDATE tbl_monthly_salaries SET status = $1 WHERE id = $2',
    UPDATE_PDF_URL: 'UPDATE tbl_monthly_salaries SET pdf_url = $1 WHERE id = $2',
    DELETE_SALARY_SLIP_DETAILS: 'DELETE FROM tbl_salary_slip_details WHERE salary_id = $1',
    FIND_COMPONENT_BY_NAME: (componentName: string) =>
        `SELECT id FROM tbl_salary_components WHERE name = '${componentName}' LIMIT 1`,
    CHECK_COLUMN_EXISTS: `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'tbl_monthly_salaries'
  `,
} as const;

// Medical Insurance Queries  
export const MEDICAL_INSURANCE_QUERIES = {
    // Commonly used queries for medical insurance operations
} as const;

// Consultant Submission Queries
export const CONSULTANT_SUBMISSION_QUERIES = {
    // Commonly used queries for consultant submission operations
} as const;

// Audit Queries
export const AUDIT_QUERIES = {
    // Commonly used queries for audit logging
} as const;

/**
 * Query Builder Helpers
 * Common patterns for building dynamic queries
 */

/**
 * Builds a WHERE clause from an array of conditions
 */
export const buildWhereClause = (conditions: string[]): string => {
    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
};

/**
 * Builds an UPDATE SET clause from field-value pairs
 */
export const buildUpdateSetClause = (
    fields: string[],
    startIndex: number = 1
): string => {
    return fields.map((field, idx) => `${field} = $${idx + startIndex}`).join(', ');
};

/**
 * Builds an INSERT VALUES placeholder
 */
export const buildInsertPlaceholders = (count: number): string => {
    return Array.from({ length: count }, (_, i) => `$${i + 1}`).join(', ');
};

/**
 * Common query patterns
 */
export const COMMON_QUERY_PATTERNS = {
    /**
     * Paginated SELECT with LIMIT and OFFSET
     */
    paginate: (baseQuery: string, limit: number, offset: number): string => {
        return `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
    },

    /**
     * SELECT with ORDER BY
     */
    orderBy: (baseQuery: string, column: string, direction: 'ASC' | 'DESC' = 'ASC'): string => {
        return `${baseQuery} ORDER BY ${column} ${direction}`;
    },
} as const;
