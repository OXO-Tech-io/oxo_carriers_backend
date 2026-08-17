import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { hasPermission } from '../../middleware/permissions';
import { JwtPayload, UserRole } from '../../types';
import { PERMISSIONS } from '../../common/constants/permissions';
import { NoticesService } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { GetNoticesQueryDto } from './get-notices-query.dto';
import { NOTICE_IMAGE_FIELD, noticeImageMulterOptions } from './notices.upload';

@Controller('notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  // status=active is the public dashboard view - any authenticated user, no
  // `notices` permission required. Anything else is the full board, including
  // inactive notices, which needs notices:write (or super admin).
  @Get()
  async list(@Query() query: GetNoticesQueryDto, @CurrentEmployee() employee: JwtPayload) {
    if (query.status === 'active') {
      const data = await this.noticesService.listActive();
      return { success: true, message: 'Notices fetched', data };
    }

    await this.requireNoticesWrite(employee);
    const data = await this.noticesService.listAll();
    return { success: true, message: 'Notices fetched', data };
  }

  private async requireNoticesWrite(employee: JwtPayload): Promise<void> {
    if (employee.role === UserRole.SUPER_ADMIN) return;
    if (!employee.employeeId || !(await hasPermission(employee.employeeId, PERMISSIONS.NOTICES, 'write'))) {
      throw new ForbiddenException('Forbidden');
    }
  }

  @Post()
  @HttpCode(201)
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.NOTICES, 'write')
  @UseInterceptors(FileInterceptor(NOTICE_IMAGE_FIELD, noticeImageMulterOptions))
  async create(
    @Body() dto: CreateNoticeDto,
    @UploadedFile() image: Express.Multer.File | undefined,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const notice = await this.noticesService.create(dto, employee.userId, image);
    return { success: true, message: 'Notice created', data: notice };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.NOTICES, 'write')
  @UseInterceptors(FileInterceptor(NOTICE_IMAGE_FIELD, noticeImageMulterOptions))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNoticeDto,
    @UploadedFile() image: Express.Multer.File | undefined,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    const notice = await this.noticesService.update(id, dto, employee.userId, image);
    return { success: true, message: 'Notice updated', data: notice };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.NOTICES, 'write')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.noticesService.remove(id);
    return { success: true, message: 'Notice deleted', data: {} };
  }
}
