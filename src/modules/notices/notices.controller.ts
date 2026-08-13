import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { PERMISSIONS } from '../../common/constants/permissions';
import { NoticesService } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { NOTICE_IMAGE_FIELD, noticeImageMulterOptions } from './notices.upload';

@Controller('notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  // Any authenticated user (every employee and system user) sees active
  // notices on their dashboard - no `notices` permission required to read.
  @Get()
  async list() {
    const data = await this.noticesService.listActive();
    return { success: true, message: 'Notices fetched', data };
  }

  // Notice-permission holders manage the full board, including inactive
  // notices - registered ahead of no conflicting `:id` route since there
  // isn't one, but kept as a distinct path for clarity.
  @Get('manage')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.NOTICES, 'write')
  async listAll() {
    const data = await this.noticesService.listAll();
    return { success: true, message: 'Notices fetched', data };
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
