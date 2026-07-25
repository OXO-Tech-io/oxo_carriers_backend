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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { LeaveCalendarService } from './leave-calendar.service';
import { CreateLeaveCalendarEntryDto } from './dto/create-leave-calendar-entry.dto';
import { UpdateLeaveCalendarEntryDto } from './dto/update-leave-calendar-entry.dto';

// Dual-mounted to match the old Express app.ts, which serves this router at
// both '/api/leave-calendar' and the legacy bare '/leave-calendar'.
@Controller('leave-calendar-entries')
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  createCalendarEntry(@CurrentEmployee() employee: JwtPayload, @Body() dto: CreateLeaveCalendarEntryDto) {
    return this.leaveCalendarService.createCalendarEntry(employee.userId, dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  updateCalendarEntry(@Param('id') idParam: string, @Body() dto: UpdateLeaveCalendarEntryDto) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid calendar entry id');
    return this.leaveCalendarService.updateCalendarEntry(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  deleteCalendarEntry(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid calendar entry id');
    return this.leaveCalendarService.deleteCalendarEntry(id);
  }
}
