import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsPositive } from 'class-validator';

export class AddGroupMembersDto {
  @ArrayMinSize(1, { message: 'At least one member is required' })
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  userIds!: number[];
}
