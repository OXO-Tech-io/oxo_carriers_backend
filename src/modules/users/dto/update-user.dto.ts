import { IsIn, IsOptional, IsString } from 'class-validator';
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

  // Only applied by the service if the caller is HR/super_admin - matches
  // the original controller's canUpdateRole gate.
  @IsOptional()
  @IsIn(Object.values(UserRole))
  role?: UserRole;
}
