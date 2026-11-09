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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, VoucherPaymentStatus, VoucherStatus } from '../../types';
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
  getAll(
    @CurrentEmployee() employee: JwtPayload,
    @Query('status') status?: VoucherStatus,
    @Query('payment_status') paymentStatus?: VoucherPaymentStatus,
  ) {
    return this.vouchersService.getAll(employee, status, paymentStatus);
  }

  // Declared before ':id' so it isn't captured as an id.
  @Get('exports/approved-unpaid')
  async exportApprovedUnpaid(@CurrentEmployee() employee: JwtPayload, @Res() res: Response) {
    const workbook = await this.vouchersService.buildApprovedUnpaidWorkbook(employee);
    const filename = `approved-unpaid-vouchers-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    await workbook.xlsx.write(res);
    res.end();
  }

  // Declared before ':id' so it isn't captured as an id.
  @Get('approval-queue')
  getApprovalQueue(@CurrentEmployee() employee: JwtPayload) {
    return this.vouchersService.getApprovalQueue(employee);
  }

  @Get(':id')
  getById(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.getById(employee, id);
  }

  @Put(':id/reviews')
  review(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string, @Body() dto: ReviewVoucherDto) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.review(employee, id, dto);
  }

  @Put(':id/bank-uploads')
  bankUpload(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.bankUpload(employee, id);
  }

  @Put(':id/payments')
  markPaid(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.markPaid(employee, id);
  }

  @Put(':id/payment-reversals')
  revertPayment(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid voucher id');
    return this.vouchersService.revertPayment(employee, id);
  }
}
