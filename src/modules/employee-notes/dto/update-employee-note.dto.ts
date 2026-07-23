import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Translated from updateEmployeeNoteSchema in
// src/validators/employeeNote.validator.ts.
export class UpdateEmployeeNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Content is required' })
  @MaxLength(5000)
  content!: string;
}
