import { IsArray, ArrayMinSize } from 'class-validator';

export class UpdateSalaryStructureDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Components array is required' })
  components!: Array<{
    component_id: number;
    amount: number;
    is_percentage?: boolean;
    percentage_of?: string;
  }>;
}
