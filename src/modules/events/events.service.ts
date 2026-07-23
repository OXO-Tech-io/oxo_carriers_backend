import { Injectable } from '@nestjs/common';
import { eventService } from '../../services/event.service';
import { CreateEventDto } from './dto/create-event.dto';
import { RecordParticipationDto } from './dto/record-participation.dto';

/**
 * Thin wrapper around the existing `eventService`
 * (src/services/event.service.ts), which already contains the query logic
 * and throws AppError subclasses (NotFoundError) - the shared
 * AllExceptionsFilter (src/common/filters/all-exceptions.filter.ts) already
 * handles AppError identically to a NestJS HttpException, so that logic is
 * reused as-is rather than re-implemented with Nest exception classes.
 */
@Injectable()
export class EventsService {
  async create(dto: CreateEventDto, createdBy: number) {
    return eventService.create(dto, createdBy);
  }

  async list() {
    return eventService.list();
  }

  async getWithParticipants(id: number) {
    return eventService.getWithParticipants(id);
  }

  async recordParticipation(id: number, dto: RecordParticipationDto, recordedBy: number) {
    return eventService.recordParticipation(id, dto.participants, recordedBy);
  }
}
