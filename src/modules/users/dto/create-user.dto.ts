import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../../../types';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  employee_id?: string;

  // SUPER_ADMIN-only escape hatch for "system users" (e.g. service/shared
  // accounts) that shouldn't get a Keycloak login. Ignored for any other
  // requester role - see UsersService.create.
  @IsOptional()
  @IsBoolean()
  skipKeycloakProvisioning?: boolean;

  @IsEmail()
  email!: string;

  @IsString()
  first_name!: string;

  @IsString()
  last_name!: string;

  @IsOptional()
  @IsIn(Object.values(UserRole))
  role?: UserRole;

  // Required for every role except Service Provider - enforced in
  // UsersService.create (not here) so the error message can be specific.
  @IsOptional()
  @IsIn(['internal', 'client_side'])
  employee_category?: 'internal' | 'client_side';

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsIn(['office', 'remote', 'hybrid'])
  work_location?: 'office' | 'remote' | 'hybrid';

  @IsOptional()
  @IsString()
  hire_date?: string;

  @IsOptional()
  manager_id?: string | number;

  @IsOptional()
  hourly_rate?: string | number;

  @IsOptional()
  @IsString()
  bank_name?: string;

  @IsOptional()
  @IsString()
  account_holder_name?: string;

  @IsOptional()
  @IsString()
  account_number?: string;

  @IsOptional()
  @IsString()
  bank_branch?: string;

  @IsOptional()
  @IsString()
  bank_branch_code?: string;

  @IsOptional()
  @IsString()
  swift_code?: string;

  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsString()
  contact_number?: string;

  // Identifies the local-PC agent this employee's in/out/break events should be
  // pushed to over the attendance WebSocket gateway - see
  // src/modules/attendance/attendance.gateway.ts.
  @IsOptional()
  @IsString()
  device_id?: string;

  // Validated separately with the existing createEmployeeProfileSchema Zod
  // schema (see users.service.ts) - it's a deeply nested, optional composite
  // object (statutory/nominees/remittance/dependents/...), not worth
  // re-modeling as nested class-validator DTOs when the Zod schema already
  // encodes the exact same rules correctly.
  @IsOptional()
  profile?: unknown;
}
