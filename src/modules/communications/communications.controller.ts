import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { CommunicationsService } from './communications.service';
import { RespondCommunicationDto } from './dto/respond-communication.dto';
import { ATTACHMENTS_FIELD, communicationAttachmentsMulterOptions, MAX_ATTACHMENTS } from './communications.upload';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('api/communications')
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get('mine')
  async listMine(@CurrentEmployee() employee: JwtPayload) {
    const communications = await this.communicationsService.listMine(employee.userId);
    return { success: true, message: 'Communications fetched', data: communications };
  }

  @Post(':id/respond')
  async respond(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: RespondCommunicationDto,
  ) {
    const id = this.parseId(idParam);
    const result = await this.communicationsService.respond(id, employee.userId, dto);
    return { success: true, message: 'Response recorded', data: result };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async listAll() {
    const communications = await this.communicationsService.listAll();
    return { success: true, message: 'Communications fetched', data: communications };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  @UseInterceptors(FilesInterceptor(ATTACHMENTS_FIELD, MAX_ATTACHMENTS, communicationAttachmentsMulterOptions))
  async create(
    @CurrentEmployee() employee: JwtPayload,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const communication = await this.communicationsService.create(employee.userId, body, files ?? []);
    return { success: true, message: 'Communication sent', data: communication };
  }

  @Get('report')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async report(@Query('id') idParam: string | undefined, @Res() res: Response) {
    const buffer = await this.communicationsService.generateReport(idParam ? Number(idParam) : undefined);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename=communications-report.xlsx');
    res.send(buffer);
  }

  private parseId(idParam: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid communication id');
    return id;
  }
}
