import { IsOptional, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_REGEX } from '../../../common/constants/validation';

export class GetWorkLogDailyStatusQueryDto {
  /** Single day to summarise. Defaults to today. Ignored when `from`/`to` are given. */
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  date?: string;

  /** Range start (inclusive), for the All Work Logs date-range filter. */
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  from?: string;

  /** Range end (inclusive), for the All Work Logs date-range filter. */
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  to?: string;
}
