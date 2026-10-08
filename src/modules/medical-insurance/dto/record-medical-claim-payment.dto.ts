import { IsOptional, IsString } from 'class-validator';

// `payment_status` is checked against the exact 'not_paid'/'partially_paid'/
// 'paid' business rule (and amount/date requirements for the paid states)
// inside the service, matching DecideMedicalClaimDto's style of keeping
// custom error messages instead of generic class-validator ones.
export class RecordMedicalClaimPaymentDto {
  @IsOptional()
  @IsString()
  payment_status?: string;

  @IsOptional()
  @IsString()
  paid_amount?: string;

  @IsOptional()
  @IsString()
  payment_date?: string;

  @IsOptional()
  @IsString()
  payment_reference?: string;
}
