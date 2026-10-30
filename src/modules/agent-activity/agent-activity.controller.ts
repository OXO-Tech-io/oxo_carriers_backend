import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtPayload } from '../../types';
import { AgentActivityService } from './agent-activity.service';
import { GetAgentLogsQueryDto } from './dto/get-agent-logs-query.dto';
import { IngestAgentLogsDto } from './dto/ingest-agent-logs.dto';

@Controller('agent-activity')
export class AgentActivityController {
  constructor(private readonly agentActivityService: AgentActivityService) {}

  /** Called by the employee's own HRIS tab with frames relayed from the local agent. */
  @Post('logs')
  async ingest(@Body() dto: IngestAgentLogsDto, @CurrentEmployee() employee: JwtPayload) {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    const result = await this.agentActivityService.ingest(employee.employeeId, dto.logs);
    return { success: true, message: 'Agent activity logs received', data: result };
  }

  /** Admin view - gated on the `attendance` permission (read); super admins bypass. */
  @Get('logs')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async list(@Query() query: GetAgentLogsQueryDto) {
    return { success: true, message: 'Agent activity logs fetched', data: await this.agentActivityService.list(query) };
  }

  @Get('summary')
  @UseGuards(PermissionGuard)
  @RequirePermission(PERMISSIONS.ATTENDANCE, 'read')
  async summary(@Query() query: GetAgentLogsQueryDto) {
    return {
      success: true,
      message: 'Agent activity summary fetched',
      data: await this.agentActivityService.summarize(query),
    };
  }
}
