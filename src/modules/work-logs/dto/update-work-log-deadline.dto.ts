import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateWorkLogDeadlineDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @Matches(HHMM_REGEX, { message: 'Deadline time must be in 24-hour HH:MM format' })
  deadlineTime?: string;

  // IANA zone name; validated against Intl in the service, since the set of
  // supported zones is a runtime property of the Node ICU build.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
