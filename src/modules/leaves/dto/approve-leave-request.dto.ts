import { IsIn, IsOptional, IsString } from 'class-validator';

// Translated field-for-field from approveLeaveRequestSchema in
// src/validators/leave.validator.ts.
export class ApproveLeaveRequestDto {
  @IsIn(['team_leader', 'hr'])
  approvedBy!: 'team_leader' | 'hr';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
