import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, SessionAction } from '../../types';
import { AttendanceService } from './attendance.service';
import { GetAttendanceHistoryQueryDto } from './dto/get-attendance-history-query.dto';
import { SessionActionDto } from './dto/session-action.dto';

function requireOwnEmployeeId(employeeIdParam: string, employee: JwtPayload): string {
  if (!employee.employeeId) {
    throw new BadRequestException('Your account has no employee ID assigned yet');
  }
  if (employeeIdParam !== employee.employeeId) {
    throw new ForbiddenException('You can only access your own attendance records');
  }
  return employee.employeeId;
}

@Controller('employees/:employeeId/attendances')
export class EmployeeAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('session')
  async recordSession(
    @Param('employeeId') employeeId: string,
    @Body() dto: SessionActionDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const ownEmployeeId = requireOwnEmployeeId(employeeId, employee);
    const session =
      dto.action === SessionAction.CLOCK_IN
        ? await this.attendanceService.clockIn(ownEmployeeId)
        : await this.attendanceService.clockOut(ownEmployeeId);
    return {
      success: true,
      message: dto.action === SessionAction.CLOCK_IN ? 'Clocked in' : 'Clocked out',
      data: session,
    };
  }

  @Get('today')
  async getToday(@Param('employeeId') employeeId: string, @CurrentEmployee() employee: JwtPayload) {
    const today = await this.attendanceService.getToday(requireOwnEmployeeId(employeeId, employee));
    return { success: true, message: "Today's attendance fetched", data: today };
  }

  @Get('history')
  async getHistory(
    @Param('employeeId') employeeId: string,
    @Query() query: GetAttendanceHistoryQueryDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const history = await this.attendanceService.getHistory(requireOwnEmployeeId(employeeId, employee), query.limit);
    return { success: true, message: 'Attendance history fetched', data: history };
  }
}
