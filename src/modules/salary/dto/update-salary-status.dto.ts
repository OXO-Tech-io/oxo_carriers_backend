import { IsIn, IsOptional, IsString } from 'class-validator';
import { SalaryStatus } from '../../../types';

export class UpdateSalaryStatusDto {
  @IsIn(Object.values(SalaryStatus))
  status!: SalaryStatus;

  @IsOptional()
  @IsString()
  paid_date?: string;
}
