import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { RecordParticipationDto } from './dto/record-participation.dto';

// The original eventRoutes.ts applies `router.use(requireHR)` for the whole
// router (HR_MANAGER/HR_EXECUTIVE only, super_admin always bypasses) -
// replicated here via the configurable `events` permission (both roles hold
// it at 'write' by default, so behavior is unchanged, but it's now
// admin-editable instead of hardcoded).
@Controller('events')
@UseGuards(PermissionGuard)
@RequirePermission(PERMISSIONS.EVENTS, 'write')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async list() {
    const events = await this.eventsService.list();
    return { success: true, message: 'Events fetched', data: events };
  }

  @Post()
  async create(@CurrentEmployee() employee: JwtPayload, @Body() dto: CreateEventDto) {
    const event = await this.eventsService.create(dto, employee.userId);
    return { success: true, message: 'Event created', data: event };
  }

  @Get(':id')
  async getById(@Param('id') idParam: string) {
    const id = this.parseId(idParam);
    const data = await this.eventsService.getWithParticipants(id);
    return { success: true, message: 'Event fetched', data };
  }

  @Post(':id/participations')
  async recordParticipation(
    @CurrentEmployee() employee: JwtPayload,
    @Param('id') idParam: string,
    @Body() dto: RecordParticipationDto,
  ) {
    const id = this.parseId(idParam);
    const result = await this.eventsService.recordParticipation(id, dto, employee.userId);
    return { success: true, message: 'Participation recorded', data: result };
  }

  private parseId(idParam: string): number {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid event id');
    return id;
  }
}
