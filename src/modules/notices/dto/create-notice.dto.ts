import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateNoticeDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1, { message: 'Message is required' })
  message!: string;

  // Sent as multipart/form-data alongside the optional image, so booleans
  // arrive as the strings "true"/"false" rather than real booleans.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  isActive?: boolean;
}
