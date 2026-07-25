import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { BookingStatus, FacilityType, JwtPayload } from '../../types';
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  // ─── Facility management (Admin) ────────────────────────────────────────

  @Get()
  getAllFacilities(@Query('type') type?: FacilityType) {
    return this.facilitiesService.getAll(type);
  }

  /** GET /facilities/available?type=workstation&start_time=ISO&end_time=ISO */
  @Get('available')
  getAvailable(
    @Query('type') type: FacilityType,
    @Query('start_time') startTime: string,
    @Query('end_time') endTime: string,
  ) {
    return this.facilitiesService.getAvailable(type, startTime, endTime);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.FACILITIES, 'write')
  createFacility(@Body() dto: CreateFacilityDto) {
    return this.facilitiesService.create(dto);
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.FACILITIES, 'write')
  updateFacility(@Param('id') idParam: string, @Body() dto: UpdateFacilityDto) {
    const id = parseInt(idParam, 10);
    return this.facilitiesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.FACILITIES, 'write')
  deleteFacility(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    return this.facilitiesService.delete(id);
  }

  // ─── Booking management ─────────────────────────────────────────────────

  @Post('bookings')
  @HttpCode(201)
  createBooking(@Body() dto: CreateBookingDto, @CurrentEmployee() employee: JwtPayload) {
    return this.facilitiesService.createBooking(employee, dto);
  }

  @Get('bookings/mine')
  getMyBookings(@CurrentEmployee() employee: JwtPayload) {
    return this.facilitiesService.getMyBookings(employee);
  }

  @Get('bookings')
  getAllBookings(
    @Query('user_id') userId?: string,
    @Query('facility_id') facilityId?: string,
    @Query('status') status?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    return this.facilitiesService.getAllBookings({
      user_id: userId ? Number(userId) : undefined,
      facility_id: facilityId ? Number(facilityId) : undefined,
      status: status as BookingStatus | undefined,
      start_date: startDate,
      end_date: endDate,
    });
  }

  @Put('bookings/:id/cancellation')
  cancelBooking(@Param('id') idParam: string, @CurrentEmployee() employee: JwtPayload) {
    const id = parseInt(idParam, 10);
    return this.facilitiesService.cancelBooking(id, employee);
  }
}
