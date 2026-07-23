import { Module } from '@nestjs/common';
import { EmployeeEducationController } from './employee-education.controller';
import { EmployeeEducationService } from './employee-education.service';

@Module({
  controllers: [EmployeeEducationController],
  providers: [EmployeeEducationService],
})
export class EmployeeEducationModule {}
