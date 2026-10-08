import { IsOptional, IsString } from 'class-validator';

// Kept intentionally loose (strings straight off the multipart body, like the
// original controller's `req.body.x`): the original controller enforces
// "Type must be IN or OPD", "Valid amount is required" and the per-type/
// per-quarter limit checks itself with specific res.status(400) messages, so
// those exact messages are reproduced in MedicalInsuranceService rather than
// re-derived from generic class-validator error text.
export class CreateMedicalClaimDto {
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
