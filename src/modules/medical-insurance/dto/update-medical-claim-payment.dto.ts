import { IsOptional, IsString } from 'class-validator';

// payment_status is checked against the exact 'partially_paid'/'paid' business
// rule (and paid_amount validation against the claim's approved amount) inside
// the service, matching the DecideMedicalClaimDto convention for this module.
export class UpdateMedicalClaimPaymentDto {
  @IsOptional()
  @IsString()
  payment_status?: string;

  @IsOptional()
  @IsString()
  paid_amount?: string;

  @IsOptional()
  @IsString()
  payment_reference?: string;
}
