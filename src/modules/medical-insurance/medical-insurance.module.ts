import { Module } from '@nestjs/common';
import { MedicalInsuranceController } from './medical-insurance.controller';
import { MedicalInsuranceService } from './medical-insurance.service';

@Module({
  controllers: [MedicalInsuranceController],
  providers: [MedicalInsuranceService],
})
export class MedicalInsuranceModule {}
