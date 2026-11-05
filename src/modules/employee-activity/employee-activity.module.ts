import { Module } from '@nestjs/common';
import { EmployeeActivityController } from './employee-activity.controller';
import { EmployeeActivityService } from './employee-activity.service';

@Module({
  controllers: [EmployeeActivityController],
  providers: [EmployeeActivityService],
})
export class EmployeeActivityModule {}
