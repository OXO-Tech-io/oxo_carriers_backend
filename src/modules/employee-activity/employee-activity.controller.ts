import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtPayload } from '../../types';
import { EmployeeActivityService } from './employee-activity.service';
import { GetEmployeeActivityLogsQueryDto } from './dto/get-employee-activity-logs-query.dto';
import { IngestEmployeeActivityLogsDto } from './dto/ingest-employee-activity-logs.dto';
import { AgentPresenceDto, ConfirmScreenshotUploadDto, IssueOwnDeviceTokenDto, RequestScreenshotUploadDto } from './dto/employee-screenshot-upload.dto';
import { logger } from '../../lib/logger';
import { checkStorageHealth } from '../../lib/storage/gcsStorage';
import { MAX_SCREENSHOT_BYTES } from './employee-activity.constants';
import { SCREENSHOT_MIME_TYPES } from './dto/employee-screenshot-upload.dto';
import { EmployeeDeviceGuard, type EmployeeDeviceRequest } from './guards/employee-device.guard';

@Controller('employee-activities')
export class EmployeeActivityController {
  constructor(private readonly employeeActivityService: EmployeeActivityService) {}

  /** Called by the employee's own HRIS tab with frames relayed from the local agent. */
  @Post('logs')
  async ingest(@Body() dto: IngestEmployeeActivityLogsDto, @CurrentEmployee() employee: JwtPayload) {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    const result = await this.employeeActivityService.ingest(employee.employeeId, dto.logs);
    return { success: true, message: 'Employee activity logs received', data: result };
  }

  /**
   * Screenshot relayed by the employee's own HRIS tab. Multipart: `file` plus eventId,
   * mimeType, fileName, capturedAt. Identity comes from the session, not the body.
   */
  @Post('screenshots')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_SCREENSHOT_BYTES, files: 1 } }),
  )
  async uploadRelayed(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string | undefined>,
    @CurrentEmployee() employee: JwtPayload,
  ) {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    if (!file) throw new BadRequestException('No screenshot file provided');

    const eventId = Number(body.eventId);
    const mimeType = body.mimeType ?? file.mimetype;
    const capturedAt = body.capturedAt ?? '';
    if (!Number.isInteger(eventId) || eventId < 0) throw new BadRequestException('eventId is invalid');
    if (!(SCREENSHOT_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException('Unsupported screenshot type');
    }
    if (Number.isNaN(Date.parse(capturedAt))) throw new BadRequestException('capturedAt is invalid');

    const fileName = (body.fileName ?? 'screenshot.jpg').slice(0, 255);
    const deviceId = (body.deviceId ?? '').trim();
    if (!deviceId) throw new BadRequestException('deviceId is required');
    logger.info(
      { employeeId: employee.employeeId, eventId, deviceId, fileName, sizeBytes: file.size },
      'Screenshot received from agent via HRIS tab',
    );
    let result;
    try {
      result = await this.employeeActivityService.uploadRelayedScreenshot(
        employee.employeeId,
        { eventId, deviceId, mimeType, fileName, capturedAt },
        file.buffer,
      );
    } catch (error) {
      logger.error({ err: error, employeeId: employee.employeeId, eventId, fileName }, 'Relayed screenshot failed to store');
      throw error;
    }
    return { success: true, message: 'Screenshot received', data: result };
  }

  /** Admin view - gated on the `attendance` permission (read); super admins bypass. */
  @Get('logs')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async list(@Query() query: GetEmployeeActivityLogsQueryDto) {
    return { success: true, message: 'Employee activity logs fetched', data: await this.employeeActivityService.list(query) };
  }

  @Get('summaries')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async summary(@Query() query: GetEmployeeActivityLogsQueryDto) {
    return {
      success: true,
      message: 'Employee activity summary fetched',
      data: await this.employeeActivityService.summarize(query),
    };
  }

  /**
   * GCP connectivity check for screenshots: bucket, write/read/delete, and URL signing, each
   * reported separately with a fix hint. Needs write on `attendance` (it writes a tiny probe object).
   */
  @Get('storage-health')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'write')
  async storageHealth() {
    return { success: true, data: await checkStorageHealth() };
  }

  /** Raw image bytes. Fetched with the bearer token (not an <img src>), so it stays behind auth. */
  @Get('screenshots/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async screenshot(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { mimeType, content } = await this.employeeActivityService.getScreenshot(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(content.length),
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(content);
  }

  // --- Direct agent API (device-token auth; no browser tab or WebSocket) ---

  /** Step 1: signed PUT URL for the screenshot. */
  @Public()
  @UseGuards(EmployeeDeviceGuard)
  @Post('devices/:deviceId/screenshots/upload-urls')
  async screenshotUploadUrl(@Body() dto: RequestScreenshotUploadDto, @Req() req: EmployeeDeviceRequest) {
    return { success: true, data: await this.employeeActivityService.requestScreenshotUpload(req.employeeDevice!, dto) };
  }

  /** Step 3: confirm after the agent PUT the bytes to the signed URL. */
  @Public()
  @UseGuards(EmployeeDeviceGuard)
  @Post('devices/:deviceId/screenshots')
  async screenshotConfirm(@Body() dto: ConfirmScreenshotUploadDto, @Req() req: EmployeeDeviceRequest) {
    return { success: true, data: await this.employeeActivityService.confirmScreenshotUpload(req.employeeDevice!, dto) };
  }

  /**
   * Self-service: the signed-in employee's tab hands the token to the local agent over its socket.
   * Only works for the device HR assigned to this employee. Declared before the admin
   * `devices/:employeeId/tokens` route so "me" is not read as an employee ID.
   */
  @Post('devices/me/tokens')
  async issueOwnToken(@Body() dto: IssueOwnDeviceTokenDto, @CurrentEmployee() employee: JwtPayload) {
    if (!employee.employeeId) throw new BadRequestException('Your account has no employee ID assigned yet');
    return {
      success: true,
      message: 'Device token issued',
      data: await this.employeeActivityService.issueOwnDeviceToken(employee.employeeId, dto.deviceId),
    };
  }

  /** The signed-in employee's tab reports its agent socket as up (ping) or down. */
  @Post('devices/me/presence')
  async reportPresence(@Body() dto: AgentPresenceDto, @CurrentEmployee() employee: JwtPayload) {
    if (!employee.employeeId) throw new BadRequestException('Your account has no employee ID assigned yet');
    return {
      success: true,
      data: await this.employeeActivityService.recordPresence(employee.employeeId, dto.deviceId, dto.connected),
    };
  }

  /** Admin view: which employees' agents are connected right now. Anyone absent is not connected. */
  @Get('presence')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async presence() {
    return { success: true, data: this.employeeActivityService.listPresence() };
  }

  // --- Admin: device token lifecycle (write on attendance) ---

  /** The plaintext token is returned once and never stored. */
  @Post('devices/:employeeId/tokens')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'write')
  async issueToken(@Param('employeeId') employeeId: string) {
    return { success: true, message: 'Device token issued', data: await this.employeeActivityService.issueDeviceToken(employeeId) };
  }

  @Delete('devices/:employeeId/tokens')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'write')
  async revokeToken(@Param('employeeId') employeeId: string) {
    return { success: true, message: 'Device token revoked', data: await this.employeeActivityService.revokeDeviceTokens(employeeId) };
  }
}
