import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameGroupDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(150)
  name!: string;
}
