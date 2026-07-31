import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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
}
