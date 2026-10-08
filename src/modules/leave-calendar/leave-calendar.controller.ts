import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { LeaveCalendarService } from './leave-calendar.service';
import { CreateLeaveCalendarEntryDto } from './dto/create-leave-calendar-entry.dto';
import { UpdateLeaveCalendarEntryDto } from './dto/update-leave-calendar-entry.dto';

@Controller('leave-calendars')
export class LeaveCalendarController {
  constructor(private readonly leaveCalendarService: LeaveCalendarService) {}

  @Get()
  getAllCalendarEntries(@Query('year') year?: string) {
    const parsedYear = year ? parseInt(Array.isArray(year) ? year[0] : year, 10) : undefined;
    return this.leaveCalendarService.getAllCalendarEntries(parsedYear);
  }

  @Get('year/:year')
  getCalendarByYear(@Param('year') year: string) {
    return this.leaveCalendarService.getCalendarByYear(parseInt(year, 10));
  }

  @Get('range')
  getCalendarByDateRange(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.leaveCalendarService.getCalendarByDateRange(startDate, endDate);
  }

  @Get('holiday-count')
  getHolidayCount(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.leaveCalendarService.getHolidayCount(startDate, endDate);
  }

  @Get('holiday-status')
  checkIsHoliday(@Query('date') date?: string) {
    return this.leaveCalendarService.checkIsHoliday(date);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.LEAVES, 'write')
  createCalendarEntry(@CurrentEmployee() employee: JwtPayload, @Body() dto: CreateLeaveCalendarEntryDto) {
    return this.leaveCalendarService.createCalendarEntry(employee.userId, dto);
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.LEAVES, 'write')
  updateCalendarEntry(@Param('id') idParam: string, @Body() dto: UpdateLeaveCalendarEntryDto) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid calendar entry id');
    return this.leaveCalendarService.updateCalendarEntry(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.LEAVES, 'write')
  deleteCalendarEntry(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid calendar entry id');
    return this.leaveCalendarService.deleteCalendarEntry(id);
  }
}
