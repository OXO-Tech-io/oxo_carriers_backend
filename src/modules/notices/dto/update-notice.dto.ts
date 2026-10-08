import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsAfterStartAt } from './is-after-start-at.validator';

export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  // OCD-567: product-agreed character limit - enforced server-side even if
  // the frontend counter is bypassed.
  @MaxLength(100, { message: 'Title must be at most 100 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Message is required' })
  // OCD-567: product-agreed character limit.
  @MaxLength(1000, { message: 'Message must be at most 1000 characters' })
  message?: string;

  // OCD-565: scheduling window - both optional on update (an unset field
  // keeps its current DB value, see NoticesService.update()). The
  // @IsAfterStartAt below only catches endAt <= startAt when BOTH are sent
  // in the same PATCH body; NoticesService.assertValidWindow() re-validates
  // against the merged, persisted values so a PATCH touching only one field
  // can't corrupt the window either.
  @IsOptional()
  @IsDateString({}, { message: 'startAt must be a valid ISO date string' })
  startAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endAt must be a valid ISO date string' })
  @IsAfterStartAt('startAt', { message: 'endAt must be after startAt' })
  endAt?: string;

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
