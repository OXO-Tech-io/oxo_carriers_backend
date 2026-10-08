import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_REGEX } from '../../../common/constants/validation';

export class WorkLogEntryDto {
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  workDate!: string;

  @IsString()
  @MinLength(1, { message: 'Task description is required' })
  @MaxLength(1000)
  taskDescription!: string;

  // Recorded in minutes per the requirements doc - 1440 minutes = 24 hours/day.
  @Type(() => Number)
  @IsInt({ message: 'Minutes must be a whole number' })
  @Min(1)
  @Max(1440)
  minutesSpent!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}

export class SubmitWorkLogsDto {
  @ArrayMinSize(1, { message: 'At least one entry is required' })
  @ValidateNested({ each: true })
  @Type(() => WorkLogEntryDto)
  entries!: WorkLogEntryDto[];
}
