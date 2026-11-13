import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload, UserRole } from '../../types';
import { EmployeeLinkedinService, SyncResultInput } from './employee-linkedin.service';

@Controller()
export class EmployeeLinkedinController {
  constructor(private readonly service: EmployeeLinkedinService) {}

  // --- importer endpoints (HR service account) ---

  @Get('linkedin-sync/queue')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async queue() {
    return { success: true, message: 'LinkedIn sync queue', data: await this.service.syncQueue() };
  }

  @Put('employees/:id/linkedin/sync-result')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
  async syncResult(@Param('id', ParseIntPipe) id: number, @Body() body: SyncResultInput) {
    return { success: true, message: 'LinkedIn sync recorded', data: await this.service.recordSyncResult(id, body ?? {}) };
  }

  // --- administrator endpoints (super admin only; enforced in the service) ---

  @Get('linkedin-sync/overview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async overview(@CurrentEmployee() actor: JwtPayload) {
    return { success: true, message: 'LinkedIn overview', data: await this.service.overview(actor) };
  }

  @Post('linkedin-sync/sync-all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async syncAll(@CurrentEmployee() actor: JwtPayload) {
    return { success: true, message: 'LinkedIn sync queued', data: await this.service.syncAll(actor) };
  }

  @Get('employees/:id/linkedin')
  async status(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() actor: JwtPayload) {
    return { success: true, message: 'LinkedIn status', data: await this.service.getStatus(id, actor) };
  }

  @Post('employees/:id/linkedin/connect')
  async connect(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() actor: JwtPayload) {
    return { success: true, message: 'LinkedIn connected', data: await this.service.connect(id, actor) };
  }

  @Delete('employees/:id/linkedin')
  async disconnect(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() actor: JwtPayload) {
    return { success: true, message: 'LinkedIn disconnected', data: await this.service.disconnect(id, actor) };
  }

  @Post('employees/:id/linkedin/refresh')
  async refresh(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() actor: JwtPayload) {
    return { success: true, message: 'LinkedIn refresh requested', data: await this.service.requestRefresh(id, actor) };
  }
}
