import { IsEnum } from 'class-validator';
import { SessionAction } from '../../../types';

export class SessionActionDto {
  @IsEnum(SessionAction)
  action!: SessionAction;
}
