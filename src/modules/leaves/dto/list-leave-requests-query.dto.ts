import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LeaveStatus } from '../../../types';

// Translated field-for-field from listLeaveRequestsQuerySchema in
// src/validators/leave.validator.ts - simple field-level rules, no
// cross-field refinement.
export class ListLeaveRequestsQueryDto {
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  // Forces the result to the caller's own requests even for roles that can
  // otherwise browse everyone's (Administrator/HR Manager) - used by their
  // personal "My Requests" view, as opposed to org-wide Leave Management.
  // `Type(() => Boolean)` isn't used here since Boolean('false') is true.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
}
