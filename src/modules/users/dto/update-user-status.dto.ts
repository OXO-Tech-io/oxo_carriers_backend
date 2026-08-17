import { IsIn } from 'class-validator';
import { EmployeeStatus } from '../../../types';

export class UpdateUserStatusDto {
  @IsIn(Object.values(EmployeeStatus))
  status!: EmployeeStatus;
}
