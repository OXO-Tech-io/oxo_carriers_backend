import { IsOptional, Matches } from 'class-validator';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class GetAllAttendanceQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: 'Date must be in YYYY-MM-DD format' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: 'Date must be in YYYY-MM-DD format' })
  to?: string;
}
