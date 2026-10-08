import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../../../types';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  manager_id?: string | number | null;

  // OCD-476: organizational/employment fields - only applied by the service
  // if the caller is HR Manager, HR Executive or Super Admin (canEditOrgFields
  // in UsersService.update).
  @IsOptional()
  @IsIn(['office', 'remote', 'hybrid'])
  work_location?: 'office' | 'remote' | 'hybrid';

  @IsOptional()
  @IsIn(['internal', 'client_side'])
  employee_category?: 'internal' | 'client_side';

  @IsOptional()
  @IsString()
  hire_date?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Only applied by the service if the caller is HR/super_admin - matches
  // the original controller's canUpdateRole gate.
  @IsOptional()
  @IsIn(Object.values(UserRole))
  role?: UserRole;
}
