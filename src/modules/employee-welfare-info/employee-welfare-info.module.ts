import { Module } from '@nestjs/common';
import { EmployeeWelfareInfoController } from './employee-welfare-info.controller';
import { EmployeeWelfareInfoService } from './employee-welfare-info.service';

@Module({
  controllers: [EmployeeWelfareInfoController],
  providers: [EmployeeWelfareInfoService],
})
export class EmployeeWelfareInfoModule {}
