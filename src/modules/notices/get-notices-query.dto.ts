import { IsIn, IsOptional } from 'class-validator';

export class GetNoticesQueryDto {
  @IsOptional()
  @IsIn(['active'])
  status?: 'active';
}
