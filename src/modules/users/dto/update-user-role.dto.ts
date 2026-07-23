import { IsIn } from 'class-validator';
import { UserRole } from '../../../types';

export class UpdateUserRoleDto {
  @IsIn(Object.values(UserRole))
  role!: UserRole;
}
