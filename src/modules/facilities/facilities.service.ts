import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FacilityModel } from './Facility';
import { FacilityBookingModel } from './FacilityBooking';
import { EmployeeModel } from '../../employees/Employee';
import { BookingStatus, FacilityType, JwtPayload, UserRole } from '../../types';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

export interface AllBookingsFilters {
  user_id?: number;
  facility_id?: number;
  status?: BookingStatus;
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class FacilitiesService {
  // ─── Facility management ────────────────────────────────────────────────

  getAll(type?: FacilityType) {
    return FacilityModel.getAll({ type });
  }

  async getAvailable(type: FacilityType, startTime: string, endTime: string) {
    if (!type || !startTime || !endTime) {
      throw new BadRequestException('Query params type, start_time and end_time are required');
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('Invalid start_time or end_time');
    }
    return FacilityModel.getAvailableByTypeAndTime(type, start, end);
  }

  create(dto: CreateFacilityDto) {
    return FacilityModel.create(dto);
  }

  async update(id: number, dto: UpdateFacilityDto) {
    const facility = await FacilityModel.update(id, dto);
    if (!facility) throw new NotFoundException('Facility not found');
    return facility;
  }

  async delete(id: number) {
    await FacilityModel.delete(id);
    return { message: 'Facility deleted successfully' };
  }

  // ─── Booking management ─────────────────────────────────────────────────

  private requireEmployeeId(employee: JwtPayload): string {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    return employee.employeeId;
  }

  async createBooking(employee: JwtPayload, dto: CreateBookingDto) {
    const startTime = new Date(dto.start_time);
    const endTime = new Date(dto.end_time);

    const isAvailable = await FacilityBookingModel.checkAvailability(dto.facility_id, startTime, endTime);
    if (!isAvailable) {
      throw new BadRequestException('Facility is not available for the selected time slot');
    }

    return FacilityBookingModel.create({
      facility_id: dto.facility_id,
      employee_id: this.requireEmployeeId(employee),
      start_time: startTime,
      end_time: endTime,
      purpose: dto.purpose,
      status: BookingStatus.CONFIRMED,
    });
  }

  getMyBookings(employee: JwtPayload) {
    return FacilityBookingModel.getAll({ employee_id: this.requireEmployeeId(employee) });
  }

  async getAllBookings(filters: AllBookingsFilters) {
    const employeeId = filters.user_id
      ? (await EmployeeModel.findById(filters.user_id))?.employeeId ?? undefined
      : undefined;
    return FacilityBookingModel.getAll({
      employee_id: employeeId,
      facility_id: filters.facility_id,
      status: filters.status,
      start_date: filters.start_date,
      end_date: filters.end_date,
    });
  }

  async cancelBooking(id: number, employee: JwtPayload) {
    const booking = await FacilityBookingModel.findById(id);
    if (!booking) throw new NotFoundException('Booking not found');

    // Only allow owner or admin/hr to cancel
    if (booking.employee_id !== employee.employeeId && employee.role === UserRole.EMPLOYEE) {
      throw new ForbiddenException('Forbidden');
    }

    await FacilityBookingModel.updateStatus(id, BookingStatus.CANCELLED);
    return { message: 'Booking cancelled' };
  }
}
