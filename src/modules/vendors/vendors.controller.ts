import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';

@Controller('vendors')
@UseGuards(PermissionGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.VENDORS, 'read')
  async getAll(@Query('search') search?: string) {
    const vendors = await this.vendorsService.getAll(search);
    return { success: true, vendors };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.VENDORS, 'read')
  async getById(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid vendor id');
    const vendor = await this.vendorsService.findById(id);
    if (!vendor) throw new NotFoundException('Vendor not found');
    return { success: true, vendor };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission(PERMISSIONS.VENDORS, 'write')
  async create(@Body() dto: CreateVendorDto) {
    const vendor = await this.vendorsService.create(dto);
    return { success: true, message: 'Vendor created successfully.', vendor };
  }
}
