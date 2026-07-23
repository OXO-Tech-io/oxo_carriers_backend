import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { EmployeeNotesService } from './employee-notes.service';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto } from './dto/update-employee-note.dto';
import { ATTACHMENTS_FIELD, ATTACHMENTS_MAX_COUNT, noteAttachmentsMulterOptions } from './employee-notes.upload';

// '/api/employee-notes' only - the old app.ts does not dual-mount this
// router at a bare '/employee-notes' path (unlike medical-insurance,
// consultant-submissions, vouchers and leave-calendar).
@Controller('api/employee-notes')
export class EmployeeNotesController {
  constructor(private readonly employeeNotesService: EmployeeNotesService) {}

  // Create is open to hr_executive/hr_manager/super_admin (checked in the
  // service itself); there is deliberately no list/view/edit route
  // reachable by hr_executive - only hr_manager/super_admin below.
  @Post()
  @UseInterceptors(FilesInterceptor(ATTACHMENTS_FIELD, ATTACHMENTS_MAX_COUNT, noteAttachmentsMulterOptions))
  create(
    @CurrentEmployee() employee: JwtPayload,
    @Body() dto: CreateEmployeeNoteDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.employeeNotesService.create(employee, dto, files ?? []);
  }

  @Get('employee/:employeeUserId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  listForEmployee(@Param('employeeUserId') employeeUserIdParam: string) {
    const employeeUserId = parseInt(employeeUserIdParam, 10);
    if (isNaN(employeeUserId)) throw new BadRequestException('Invalid employee user id');
    return this.employeeNotesService.listForEmployee(employeeUserId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  getById(@Param('id') idParam: string) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid note id');
    return this.employeeNotesService.getById(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER)
  update(@Param('id') idParam: string, @Body() dto: UpdateEmployeeNoteDto) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid note id');
    return this.employeeNotesService.update(id, dto);
  }
}
