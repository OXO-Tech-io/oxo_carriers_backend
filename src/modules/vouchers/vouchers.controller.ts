import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, VoucherStatus } from '../../types';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { ReviewVoucherDto } from './dto/review-voucher.dto';
import { INVOICE_FIELD, voucherInvoiceMulterOptions } from './vouchers.upload';

// Dual-mounted to match the old Express app.ts, which serves this router at
// both '/api/vouchers' and the legacy bare '/vouchers'.
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get('service-providers')
  getServiceProviders(@CurrentEmployee() employee: JwtPayload) {
    return this.vouchersService.getServiceProviders(employee);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor(INVOICE_FIELD, voucherInvoiceMulterOptions))
  create(
    @CurrentEmployee() employee: JwtPayload,
    @Body() dto: CreateVoucherDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.vouchersService.create(employee, dto, file);
  }

  @Get()
  getAll(@CurrentEmployee() employee: JwtPayload, @Query('status') status?: VoucherStatus) {
    return this.vouchersService.getAll(employee, status);
  }

  @Get(':id')
  getById(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.getById(employee, id);
  }

  @Put(':id/review')
  review(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string, @Body() dto: ReviewVoucherDto) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.review(employee, id, dto);
  }

  @Put(':id/resubmission')
  resubmit(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.resubmit(employee, id);
  }

  @Put(':id/bank-upload')
  bankUpload(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.bankUpload(employee, id);
  }

  @Put(':id/paid')
  markPaid(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.markPaid(employee, id);
  }
}
