import { Type } from 'class-transformer';
import { ArrayMinSize, IsBoolean, IsInt, IsOptional, IsPositive, ValidateNested } from 'class-validator';

// Translated field-for-field from recordParticipationSchema in
// src/validators/event.validator.ts - simple field-level rules, no
// cross-field refinement.
export class ParticipationEntryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId!: number;

  @IsBoolean()
  participated!: boolean;

  @IsOptional()
  @IsBoolean()
  willParticipate?: boolean | null;
}

export class RecordParticipationDto {
  @ArrayMinSize(1, { message: 'At least one participant record is required' })
  @ValidateNested({ each: true })
  @Type(() => ParticipationEntryDto)
  participants!: ParticipationEntryDto[];
}
