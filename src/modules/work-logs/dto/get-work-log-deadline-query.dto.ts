import { IsOptional, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_REGEX } from '../../../common/constants/validation';

export class GetWorkLogDeadlineQueryDto {
  /** Work date to resolve the deadline against. Defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  workDate?: string;
}
