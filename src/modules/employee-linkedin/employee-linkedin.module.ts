import { Module } from '@nestjs/common';
import { EmployeeLinkedinController } from './employee-linkedin.controller';
import { EmployeeLinkedinService } from './employee-linkedin.service';

@Module({
  controllers: [EmployeeLinkedinController],
  providers: [EmployeeLinkedinService],
})
export class EmployeeLinkedinModule {}
