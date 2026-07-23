import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload, UserRole } from '../../types';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { RecordParticipationDto } from './dto/record-participation.dto';

// The original eventRoutes.ts applies `router.use(requireHR)` for the whole
// router (HR_MANAGER/HR_EXECUTIVE only, super_admin always bypasses) -
// replicated here at the controller level.
@Controller('api/events')
@UseGuards(RolesGuard)
@Roles(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE)
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

  @Post(':id/participation')
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
