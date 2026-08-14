import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { AttendanceService } from './attendance.service';
import { GetAllAttendanceQueryDto } from './dto/get-all-attendance-query.dto';

@Controller('employees/attendances')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /** Admin/report view - every employee's in/out time and daily hours. Gated on the
   *  `attendance` permission (read); super admins bypass via PermissionGuard. */
  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async getAll(@Query() query: GetAllAttendanceQueryDto) {
    const history = await this.attendanceService.getAllHistory({ from: query.from, to: query.to });
    return { success: true, message: 'Attendance fetched', data: history };
  }
}
