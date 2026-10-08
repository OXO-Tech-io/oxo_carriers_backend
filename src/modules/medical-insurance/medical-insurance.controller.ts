import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, MedicalClaimStatus, MedicalClaimType } from '../../types';
import { MedicalInsuranceService, MedicalDocumentFiles } from './medical-insurance.service';
import { CreateMedicalClaimDto } from './dto/create-medical-claim.dto';
import { ResubmitMedicalClaimDto } from './dto/resubmit-medical-claim.dto';
import { DecideMedicalClaimDto } from './dto/decide-medical-claim.dto';
import { RecordMedicalClaimPaymentDto } from './dto/record-medical-claim-payment.dto';
import { MEDICAL_DOCUMENT_FIELDS, medicalDocumentsMulterOptions } from './medical-insurance.upload';

// Dual-mounted to match the old Express app.ts, which serves this router at
// both '/api/medical-insurance' and the legacy bare '/medical-insurance'.
@Controller('medical-insurance-claims')
export class MedicalInsuranceController {
  constructor(private readonly medicalInsuranceService: MedicalInsuranceService) {}

  @Get('limits')
  getLimits() {
    return this.medicalInsuranceService.getLimits();
  }

  @Get('opd-balance')
  getOpdBalance(@CurrentEmployee() employee: JwtPayload, @Query('quarter') quarter?: string) {
    return this.medicalInsuranceService.getOpdBalance(employee, quarter);
  }

  @Get()
  getClaims(
    @CurrentEmployee() employee: JwtPayload,
    @Query('status') status?: MedicalClaimStatus,
    @Query('type') type?: MedicalClaimType,
    @Query('mine') mine?: string,
  ) {
    return this.medicalInsuranceService.getClaims(employee, status, type, mine === 'true');
  }

  @Get(':id')
  getClaimById(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid claim id');
    return this.medicalInsuranceService.getClaimById(employee, id);
  }

  @Post()
  @UseInterceptors(FileFieldsInterceptor(MEDICAL_DOCUMENT_FIELDS, medicalDocumentsMulterOptions))
  apply(
    @CurrentEmployee() employee: JwtPayload,
    @Body() dto: CreateMedicalClaimDto,
    @UploadedFiles() files: MedicalDocumentFiles,
  ) {
    return this.medicalInsuranceService.apply(employee, dto, files);
  }

  @Put(':id/decisions')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.MEDICAL_CLAIMS, 'write')
  decideClaim(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: DecideMedicalClaimDto,
  ) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid claim id');
    return this.medicalInsuranceService.decideClaim(employee, id, dto);
  }

  @Put(':id/payments')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.MEDICAL_CLAIMS, 'write')
  recordPayment(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: RecordMedicalClaimPaymentDto,
  ) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid claim id');
    return this.medicalInsuranceService.recordPayment(employee, id, dto);
  }

  @Put(':id/cancel')
  cancelClaim(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid claim id');
    return this.medicalInsuranceService.cancelClaim(employee, id);
  }

  @Post(':id/resubmissions')
  @UseInterceptors(FileFieldsInterceptor(MEDICAL_DOCUMENT_FIELDS, medicalDocumentsMulterOptions))
  resubmit(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: ResubmitMedicalClaimDto,
    @UploadedFiles() files: MedicalDocumentFiles,
  ) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid claim id');
    return this.medicalInsuranceService.resubmit(employee, id, dto, files);
  }
}
