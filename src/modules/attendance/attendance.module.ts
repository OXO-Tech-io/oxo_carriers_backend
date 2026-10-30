import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { EmployeeAttendanceController } from './employee-attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceGateway } from './attendance.gateway';

@Module({
  controllers: [AttendanceController, EmployeeAttendanceController],
  providers: [AttendanceService, AttendanceGateway],
})
export class AttendanceModule {}
