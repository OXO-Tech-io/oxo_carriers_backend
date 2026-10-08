import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { EmployeeAttendanceController } from './employee-attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  controllers: [AttendanceController, EmployeeAttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
