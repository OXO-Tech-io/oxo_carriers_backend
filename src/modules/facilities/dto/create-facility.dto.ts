import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { FacilityType } from '../../../types';

export class CreateFacilityDto {
  @IsString()
  name!: string;

  @IsEnum(FacilityType)
  type!: FacilityType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  facilities?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
