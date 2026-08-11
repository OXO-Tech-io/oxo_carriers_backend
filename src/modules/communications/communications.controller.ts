import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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

@Controller('communications')
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Post(':id/responses')
  async respond(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: RespondCommunicationDto,
  ) {
    const id = this.parseId(idParam);
    const result = await this.communicationsService.respond(id, employee.employeeId!, dto);
    return { success: true, message: 'Response recorded', data: result };
  }

  // Without ?employee_id=, this is the HR-only "all communications" list.
  // With ?employee_id=, it's the recipient's own inbox (formerly GET
  // /communications/mine) - callers may only pass their own employeeId
  // unless they're HR/super_admin, matching the access /mine used to give.
  @Get()
  async list(@Query('employee_id') employeeId: string | undefined, @CurrentEmployee() employee: JwtPayload) {
    const isHr = employee.role === UserRole.HR_MANAGER || employee.role === UserRole.HR_EXECUTIVE || employee.role === UserRole.SUPER_ADMIN;

    if (employeeId) {
      if (employeeId !== employee.employeeId && !isHr) {
        throw new ForbiddenException('You can only view your own communications');
      }
      const communications = await this.communicationsService.listMine(employeeId);
      return { success: true, message: 'Communications fetched', data: communications };
    }

    if (!isHr) {
      throw new ForbiddenException('Forbidden: Insufficient permissions');
    }
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

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    await this.communicationsService.delete(id);
    return { success: true, message: 'Communication deleted' };
  }

  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async report(@Res() res: Response) {
    const buffer = await this.communicationsService.generateReport();
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename=communications-report.xlsx');
    res.send(buffer);
  }

  @Get(':id/reports')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  async reportById(@Param('id') idParam: string, @Res() res: Response) {
    const id = this.parseId(idParam);
    const buffer = await this.communicationsService.generateReport(id);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename=communication-${id}-report.xlsx`);
    res.send(buffer);
  }

  private parseId(idParam: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid communication id');
    return id;
  }
}
