import { Type } from 'class-transformer';
import { ArrayMinSize, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_REGEX } from '../../../common/constants/validation';

export class WorkLogEntryDto {
  @Matches(ISO_DATE_REGEX, { message: ISO_DATE_MESSAGE })
  workDate!: string;

  @IsString()
  @MinLength(1, { message: 'Task description is required' })
  @MaxLength(1000)
  taskDescription!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(24)
  hoursSpent!: number;

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
