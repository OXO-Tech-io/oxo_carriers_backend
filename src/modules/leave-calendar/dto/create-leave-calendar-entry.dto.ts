import { IsOptional, IsString } from 'class-validator';

// Kept loose: the original controller enforces "Date and name are required"
// and "A holiday already exists for this date" itself with specific
// res.status(400) messages, so those exact messages are reproduced in
// LeaveCalendarService instead of generic class-validator error text.
export class CreateLeaveCalendarEntryDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Accepts boolean or the string 'true'/'false' like the original
  // (`is_recurring === true || is_recurring === 'true'`).
  @IsOptional()
  is_recurring?: boolean | string;

  @IsOptional()
  year?: number | string;
}
