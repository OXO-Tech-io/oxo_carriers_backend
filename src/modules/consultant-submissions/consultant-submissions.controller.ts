import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { ConsultantSubmissionStatus, JwtPayload, UserRole } from '../../types';
import { ConsultantSubmissionsService } from './consultant-submissions.service';
import { CreateConsultantSubmissionDto } from './dto/create-consultant-submission.dto';
import { ResubmitConsultantSubmissionDto } from './dto/resubmit-consultant-submission.dto';
import { DecideConsultantSubmissionDto } from './dto/decide-consultant-submission.dto';
import { consultantLogSheetMulterOptions, LOG_SHEET_FIELD } from './consultant-submissions.upload';

// Dual-mounted to match the old Express app.ts, which serves this router at
// both '/api/consultant-submissions' and the legacy bare '/consultant-submissions'.
@Controller('consultant-submissions')
export class ConsultantSubmissionsController {
  constructor(private readonly consultantSubmissionsService: ConsultantSubmissionsService) {}

  @Get()
  getSubmissions(@CurrentEmployee() employee: JwtPayload, @Query('status') status?: ConsultantSubmissionStatus) {
    return this.consultantSubmissionsService.getSubmissions(employee, status);
  }

  @Get(':id')
  getSubmissionById(@CurrentEmployee() employee: JwtPayload, @Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid submission id');
    return this.consultantSubmissionsService.getSubmissionById(employee, id);
  }

  @Post()
  @UseInterceptors(FileInterceptor(LOG_SHEET_FIELD, consultantLogSheetMulterOptions))
  submit(
    @CurrentEmployee() employee: JwtPayload,
    @Body() dto: CreateConsultantSubmissionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.consultantSubmissionsService.submit(employee, dto, file);
  }

  @Put(':id/decision')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  decideSubmission(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: DecideConsultantSubmissionDto,
  ) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid submission id');
    return this.consultantSubmissionsService.decideSubmission(employee, id, dto);
  }

  @Post(':id/resubmissions')
  @UseInterceptors(FileInterceptor(LOG_SHEET_FIELD, consultantLogSheetMulterOptions))
  resubmit(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: ResubmitConsultantSubmissionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid submission id');
    return this.consultantSubmissionsService.resubmit(employee, id, dto, file);
  }
}
