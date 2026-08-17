import { IsOptional, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_REGEX } from '../../../common/constants/validation';

export class GetAttendanceQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  to?: string;
}
