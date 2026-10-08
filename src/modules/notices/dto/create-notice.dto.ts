import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsAfterStartAt } from './is-after-start-at.validator';

export class CreateNoticeDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  // OCD-567: product-agreed character limit - enforced server-side even if
  // the frontend counter is bypassed.
  @MaxLength(100, { message: 'Title must be at most 100 characters' })
  title!: string;

  @IsString()
  @MinLength(1, { message: 'Message is required' })
  // OCD-567: product-agreed character limit.
  @MaxLength(1000, { message: 'Message must be at most 1000 characters' })
  message!: string;

  // OCD-565: every new notice must declare when it starts showing.
  @IsDateString({}, { message: 'startAt must be a valid ISO date string' })
  startAt!: string;

  // OCD-565: every new notice must also declare when it stops showing.
  @IsDateString({}, { message: 'endAt must be a valid ISO date string' })
  @IsAfterStartAt('startAt', { message: 'endAt must be after startAt' })
  endAt!: string;

  // Sent as multipart/form-data alongside the optional image, so booleans
  // arrive as the strings "true"/"false" rather than real booleans.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  isActive?: boolean;
}
