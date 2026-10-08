import { IsOptional, IsString } from 'class-validator';

// `action` and the admin_comment-required-for-rejection rule are checked in
// the service so the original's exact messages are preserved (see
// medical-insurance's DecideMedicalClaimDto for the same rationale).
export class DecideConsultantSubmissionDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  admin_comment?: string;
}
