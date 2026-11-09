import { IsOptional, IsString } from 'class-validator';

// `action` ('approve' | 'reject') is validated in the service so the
// "Invalid action" message stays specific. `comment` is the rejection reason
// (mandatory when rejecting, enforced in the service).
export class ReviewVoucherDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
