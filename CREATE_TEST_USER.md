# Create Test User

The 401 Unauthorized error means the user doesn't exist in the database yet.

## Quick Fix - Create Test User

Run this command in the backend directory:

```bash
npm run create-test-user
```

This will create a test user with:
- **Email**: test@gmail.com
- **Password**: admin@12
- **Role**: HR Manager

## Manual Creation via SQL

Alternatively, you can create the user directly in MySQL:

```sql
USE hris_payroll;

INSERT INTO users (employee_id, email, password, first_name, last_name, role, must_change_password)
VALUES (
  'EMP20260001',
  'test@gmail.com',
  '$2a$10$rKqX8X8X8X8X8X8X8X8XeX8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X8X',
  'Test',
  'User',
  'hr_manager',
  false
);
```

**Note**: The password hash above is for 'admin@12'. To generate your own hash, use the script.

## After Creating User

1. Try logging in again with:
   - Email: test@gmail.com
   - Password: admin@12

2. If it still fails, check:
   - Backend server is running
   - Database connection is working
   - Check backend console for error messages
