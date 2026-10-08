import { IsOptional, IsString } from 'class-validator';

// `action` is checked against the exact 'approve'/'reject' business rule
// (and admin_comment-required-for-rejection) inside the service, so the
// original's custom error messages ("action must be 'approve' or 'reject'",
// "Admin comment is required for rejection") are preserved verbatim instead
// of being replaced by generic class-validator messages.
export class DecideMedicalClaimDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  admin_comment?: string;
}
