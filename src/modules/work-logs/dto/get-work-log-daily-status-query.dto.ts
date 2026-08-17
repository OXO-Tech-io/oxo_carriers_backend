import { IsOptional, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_REGEX } from '../../../common/constants/validation';

export class GetWorkLogDailyStatusQueryDto {
  /** Day to summarise. Defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  date?: string;
}
