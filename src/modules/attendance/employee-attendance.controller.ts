import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, SessionAction } from '../../types';
import { AttendanceService } from './attendance.service';
import { GetAttendanceQueryDto } from './dto/get-attendance-query.dto';
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

  @Post()
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

  /**
   * An employee's own daily attendance in [from, to] (inclusive) - both default to today.
   * Pass the same date for `from`/`to` for a "today" view, or a wider range for history.
   */
  @Get()
  async getAttendance(
    @Param('employeeId') employeeId: string,
    @Query() query: GetAttendanceQueryDto,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const days = await this.attendanceService.getHistory(requireOwnEmployeeId(employeeId, employee), query);
    return { success: true, message: 'Attendance fetched', data: days };
  }
}
