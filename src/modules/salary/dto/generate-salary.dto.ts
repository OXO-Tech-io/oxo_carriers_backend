import { IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateSalaryDto {
  @IsNotEmpty()
  userId!: number | string;

  @Type(() => Number)
  @IsInt()
  month!: number;

  @Type(() => Number)
  @IsInt()
  year!: number;
}
