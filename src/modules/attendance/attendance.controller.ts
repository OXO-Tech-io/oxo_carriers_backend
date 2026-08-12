import { BadRequestException, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { AttendanceService } from './attendance.service';
import { GetAttendanceHistoryQueryDto } from './dto/get-attendance-history-query.dto';

function requireEmployeeId(employee: JwtPayload): string {
  if (!employee.employeeId) {
    throw new BadRequestException('Your account has no employee ID assigned yet');
  }
  return employee.employeeId;
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('session/start')
  async clockIn(@CurrentEmployee() employee: JwtPayload) {
    const session = await this.attendanceService.clockIn(requireEmployeeId(employee));
    return { success: true, message: 'Clocked in', data: session };
  }

  @Post('session/end')
  async clockOut(@CurrentEmployee() employee: JwtPayload) {
    const session = await this.attendanceService.clockOut(requireEmployeeId(employee));
    return { success: true, message: 'Clocked out', data: session };
  }

  @Get('me/today')
  async getToday(@CurrentEmployee() employee: JwtPayload) {
    const today = await this.attendanceService.getToday(requireEmployeeId(employee));
    return { success: true, message: "Today's attendance fetched", data: today };
  }

  @Get('me/history')
  async getHistory(@Query() query: GetAttendanceHistoryQueryDto, @CurrentEmployee() employee: JwtPayload) {
    const history = await this.attendanceService.getHistory(requireEmployeeId(employee), query.limit);
    return { success: true, message: 'Attendance history fetched', data: history };
  }
}
