import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_SCREENSHOT_BYTES } from '../agent-activity.constants';

export const SCREENSHOT_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

/** Step 1 - the agent asks where to PUT the image. */
export class RequestScreenshotUploadDto {
  @IsInt()
  @Min(0)
  eventId!: number;

  @IsIn(SCREENSHOT_MIME_TYPES)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_SCREENSHOT_BYTES)
  sizeBytes!: number;
}

/** Step 3 - the agent confirms the PUT finished so the row can be written. */
export class ConfirmScreenshotUploadDto {
  @IsInt()
  @Min(0)
  eventId!: number;

  @IsIn(SCREENSHOT_MIME_TYPES)
  mimeType!: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsDateString()
  capturedAt!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  sha256?: string;
}
