import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveCalendarModel } from '../../models/LeaveCalendar';
import { CreateLeaveCalendarEntryDto } from './dto/create-leave-calendar-entry.dto';
import { UpdateLeaveCalendarEntryDto } from './dto/update-leave-calendar-entry.dto';

@Injectable()
export class LeaveCalendarService {
  async getAllCalendarEntries(year?: number) {
    const entries = year ? await LeaveCalendarModel.getByYear(year) : await LeaveCalendarModel.getAll();
    return { success: true, data: entries };
  }

  async getCalendarByYear(year: number) {
    const entries = await LeaveCalendarModel.getByYear(year);
    return { success: true, data: entries };
  }

  async getCalendarByDateRange(startDate?: string, endDate?: string) {
    if (!startDate || !endDate) {
      throw new BadRequestException('Start date and end date are required');
    }
    const entries = await LeaveCalendarModel.getByDateRange(new Date(startDate), new Date(endDate));
    return { success: true, data: entries };
  }

  async createCalendarEntry(userId: number, dto: CreateLeaveCalendarEntryDto) {
    const { date, name, description, is_recurring, year } = dto;

    if (!date || !name) {
      throw new BadRequestException('Date and name are required');
    }

    const existing = await LeaveCalendarModel.getByDateRange(new Date(date), new Date(date));
    if (existing.length > 0) {
      throw new BadRequestException('A holiday already exists for this date');
    }

    const entry = await LeaveCalendarModel.create({
      date: new Date(date),
      name,
      description,
      is_recurring: is_recurring === true || is_recurring === 'true',
      year: year ? parseInt(String(year), 10) : undefined,
      created_by: userId,
    });

    return { success: true, message: 'Calendar entry created successfully', data: entry };
  }

  async updateCalendarEntry(id: number, dto: UpdateLeaveCalendarEntryDto) {
    const { date, name, description, is_recurring, year } = dto;

    const entry = await LeaveCalendarModel.update(id, {
      date: date ? new Date(date) : undefined,
      name,
      description,
      is_recurring: is_recurring !== undefined ? is_recurring === true || is_recurring === 'true' : undefined,
      year: year ? parseInt(String(year), 10) : undefined,
    });

    return { success: true, message: 'Calendar entry updated successfully', data: entry };
  }

  async deleteCalendarEntry(id: number) {
    const deleted = await LeaveCalendarModel.delete(id);
    if (!deleted) {
      throw new NotFoundException('Calendar entry not found');
    }
    return { success: true, message: 'Calendar entry deleted successfully' };
  }

  async getHolidayCount(startDate?: string, endDate?: string) {
    if (!startDate || !endDate) {
      throw new BadRequestException('Start date and end date are required');
    }
    const count = await LeaveCalendarModel.getHolidayCount(new Date(startDate), new Date(endDate));
    return { success: true, count };
  }

  async checkIsHoliday(date?: string) {
    if (!date) {
      throw new BadRequestException('Date is required');
    }
    const isHoliday = await LeaveCalendarModel.isHoliday(new Date(date));
    return { success: true, isHoliday };
  }
}
