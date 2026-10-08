import { IsOptional, IsString } from 'class-validator';

export class UpdateLeaveCalendarEntryDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  is_recurring?: boolean | string;

  @IsOptional()
  year?: number | string;
}
