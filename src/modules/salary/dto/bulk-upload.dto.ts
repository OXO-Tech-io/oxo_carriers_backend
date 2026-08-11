import { IsNotEmpty } from 'class-validator';

export class BulkUploadSalaryDto {
  @IsNotEmpty({ message: 'Month and year are required' })
  month!: string;

  @IsNotEmpty({ message: 'Month and year are required' })
  year!: string;
}
