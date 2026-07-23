import { IsOptional, IsString } from 'class-validator';

// `action` ('approve' | 'reject' | 'information_request') is validated in the
// service against the original's exact "Invalid action" message.
export class ReviewVoucherDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
