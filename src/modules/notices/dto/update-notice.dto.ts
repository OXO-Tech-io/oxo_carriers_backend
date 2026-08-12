import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Message is required' })
  message?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
