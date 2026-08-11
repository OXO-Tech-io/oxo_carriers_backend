import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Translated field-for-field from createEventSchema in
// src/validators/event.validator.ts - simple field-level rules, no
// cross-field refinement.
export class CreateEventDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1, { message: 'Event date is required' })
  eventDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
