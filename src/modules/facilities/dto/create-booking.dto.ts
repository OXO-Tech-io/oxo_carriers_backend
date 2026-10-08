import { IsInt, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsInt()
  facility_id!: number;

  @IsISO8601()
  start_time!: string;

  @IsISO8601()
  end_time!: string;

  @IsOptional()
  @IsString()
  purpose?: string;
}
