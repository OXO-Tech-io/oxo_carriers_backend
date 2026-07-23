import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

// Translated field-for-field from the existing Zod schema
// (createEmployeeNoteSchema in src/validators/employeeNote.validator.ts) -
// simple field-level rules, no cross-field refinement, so a direct
// class-validator translation is safe here.
export class CreateEmployeeNoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeUserId!: number;

  @IsString()
  @IsNotEmpty({ message: 'Content is required' })
  @MaxLength(5000)
  content!: string;
}
