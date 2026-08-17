import { Transform } from 'class-transformer';
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

  // Sent as multipart/form-data alongside the optional image, so booleans
  // arrive as the strings "true"/"false" rather than real booleans.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  isActive?: boolean;

  // Explicit clear of the current image without uploading a replacement.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  removeImage?: boolean;
}
