import { Type } from 'class-transformer';
import { ArrayMinSize, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, MinLength, ValidateNested } from 'class-validator';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class WorkLogEntryDto {
  @Matches(ISO_DATE_REGEX, { message: 'Date must be in YYYY-MM-DD format' })
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
