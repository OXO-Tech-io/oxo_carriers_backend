import { IsOptional, IsString } from 'class-validator';

// Kept loose (strings straight off the multipart body, like the original
// controller's `req.body.x`): the original enforces "Total hours must be a
// number", "Total hours must be greater than 0" and "Log sheet (Excel) is
// required" itself with specific res.status(400) messages, so those exact
// messages are reproduced in ConsultantSubmissionsService instead of being
// re-derived from generic class-validator error text. Presence of
// project/tech/total_hours is enforced by the (removed) validateRequiredFields
// middleware in the original - reproduced the same way in the service.
export class CreateConsultantSubmissionDto {
  @IsOptional()
  @IsString()
  project?: string;

  @IsOptional()
  @IsString()
  tech?: string;

  @IsOptional()
  @IsString()
  total_hours?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
