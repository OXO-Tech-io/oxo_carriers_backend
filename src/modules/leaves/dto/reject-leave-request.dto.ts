import { IsNotEmpty, IsString } from 'class-validator';

// Translated field-for-field from rejectLeaveRequestSchema in
// src/validators/leave.validator.ts.
export class RejectLeaveRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  rejectionReason!: string;
}
