import { IsOptional, IsString } from 'class-validator';

// See create-medical-claim.dto.ts for why this stays loosely typed.
export class ResubmitMedicalClaimDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  quarter?: string;

  @IsOptional()
  @IsString()
  amount?: string;
}
