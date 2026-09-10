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

  // Identifies the local-PC agent this employee's in/out/break events should be
  // pushed to over the attendance WebSocket gateway - see
  // src/modules/attendance/attendance.gateway.ts. Pass '' to clear it.
  @IsOptional()
  @IsString()
  device_id?: string;
}
