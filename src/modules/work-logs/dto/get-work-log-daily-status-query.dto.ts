import { IsOptional, Matches } from 'class-validator';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class GetWorkLogDailyStatusQueryDto {
  /** Day to summarise. Defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: 'Date must be in YYYY-MM-DD format' })
  date?: string;
}
