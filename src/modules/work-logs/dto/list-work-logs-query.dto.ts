import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_REGEX } from '../../../common/constants/validation';

export class ListWorkLogsQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId?: number;
}
