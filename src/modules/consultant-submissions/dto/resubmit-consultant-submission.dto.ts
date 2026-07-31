import { IsOptional, IsString } from 'class-validator';

// See create-consultant-submission.dto.ts for why this stays loosely typed.
export class ResubmitConsultantSubmissionDto {
  @IsOptional()
  @IsString()
  project?: string;

  @IsOptional()
  @IsString()
  tech?: string;

  @IsOptional()
  @IsString()
  total_hours?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
