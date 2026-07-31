import { Module } from '@nestjs/common';
import { EmployeeWorkHistoryController } from './employee-work-history.controller';
import { EmployeeWorkHistoryService } from './employee-work-history.service';

@Module({
  controllers: [EmployeeWorkHistoryController],
  providers: [EmployeeWorkHistoryService],
})
export class EmployeeWorkHistoryModule {}
