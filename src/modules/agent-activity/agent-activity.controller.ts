import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtPayload } from '../../types';
import { EmployeeActivityService } from './agent-activity.service';
import { GetAgentLogsQueryDto } from './dto/get-agent-logs-query.dto';
import { IngestAgentLogsDto } from './dto/ingest-agent-logs.dto';
import { ConfirmScreenshotUploadDto, RequestScreenshotUploadDto } from './dto/agent-screenshot-upload.dto';
import { AgentDeviceGuard, type AgentDeviceRequest } from './guards/agent-device.guard';

@Controller('employee-activities')
export class EmployeeActivityController {
  constructor(private readonly employeeActivityService: EmployeeActivityService) {}

  /** Called by the employee's own HRIS tab with frames relayed from the local agent. */
  @Post('logs')
  async ingest(@Body() dto: IngestAgentLogsDto, @CurrentEmployee() employee: JwtPayload) {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    const result = await this.employeeActivityService.ingest(employee.employeeId, dto.logs);
    return { success: true, message: 'Agent activity logs received', data: result };
  }

  /** Admin view - gated on the `attendance` permission (read); super admins bypass. */
  @Get('logs')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async list(@Query() query: GetAgentLogsQueryDto) {
    return { success: true, message: 'Agent activity logs fetched', data: await this.employeeActivityService.list(query) };
  }

  @Get('summaries')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async summary(@Query() query: GetAgentLogsQueryDto) {
    return {
      success: true,
      message: 'Agent activity summary fetched',
      data: await this.employeeActivityService.summarize(query),
    };
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
  @UseGuards(AgentDeviceGuard)
  @Post('devices/:deviceId/screenshots/upload-urls')
  async screenshotUploadUrl(@Body() dto: RequestScreenshotUploadDto, @Req() req: AgentDeviceRequest) {
    return { success: true, data: await this.employeeActivityService.requestScreenshotUpload(req.agentDevice!, dto) };
  }

  /** Step 3: confirm after the agent PUT the bytes to the signed URL. */
  @Public()
  @UseGuards(AgentDeviceGuard)
  @Post('devices/:deviceId/screenshots')
  async screenshotConfirm(@Body() dto: ConfirmScreenshotUploadDto, @Req() req: AgentDeviceRequest) {
    return { success: true, data: await this.employeeActivityService.confirmScreenshotUpload(req.agentDevice!, dto) };
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
