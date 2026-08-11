import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../types';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';

const CAN_ACCESS_VENDORS = [
  UserRole.HR_MANAGER,
  UserRole.HR_EXECUTIVE,
  UserRole.FINANCE_MANAGER,
  UserRole.FINANCE_EXECUTIVE,
];

@Controller('vendors')
@UseGuards(RolesGuard)
@Roles(...CAN_ACCESS_VENDORS)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  async getAll(@Query('search') search?: string) {
    const vendors = await this.vendorsService.getAll(search);
    return { success: true, vendors };
  }

  @Get(':id')
  async getById(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid vendor id');
    const vendor = await this.vendorsService.findById(id);
    if (!vendor) throw new NotFoundException('Vendor not found');
    return { success: true, vendor };
  }

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateVendorDto) {
    const vendor = await this.vendorsService.create(dto);
    return { success: true, message: 'Vendor created successfully.', vendor };
  }
}
