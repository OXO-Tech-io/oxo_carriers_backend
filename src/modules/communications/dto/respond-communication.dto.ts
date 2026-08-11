import { IsOptional, IsString, MaxLength } from 'class-validator';

// Translated field-for-field from respondCommunicationSchema in
// src/validators/communication.validator.ts.
export class RespondCommunicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  responseText?: string;
}
