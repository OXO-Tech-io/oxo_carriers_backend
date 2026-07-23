import { Injectable } from '@nestjs/common';
import { communicationService } from '../../services/communication.service';
import { createCommunicationSchema } from '../../validators/communication.validator';
import { RespondCommunicationDto } from './dto/respond-communication.dto';

/**
 * Thin wrapper around the existing `communicationService`
 * (src/services/communication.service.ts), which already contains all
 * validation/permission logic and throws AppError subclasses
 * (NotFoundError/ForbiddenError) - the shared AllExceptionsFilter
 * (src/common/filters/all-exceptions.filter.ts) already handles AppError
 * identically to a NestJS HttpException, so that logic is reused as-is
 * rather than re-implemented with Nest exception classes.
 */
@Injectable()
export class CommunicationsService {
  /**
   * `createCommunicationSchema` is not translated to a class-validator DTO:
   * it has a cross-field `.refine` (at least one of recipientUserIds /
   * recipientGroupIds must be non-empty) AND a transform that accepts either
   * a real array (JSON body) or a JSON-encoded string (required because file
   * attachments force multipart/form-data, where array fields arrive as
   * strings). Kept as raw Zod validation here; a thrown ZodError propagates
   * to the global AllExceptionsFilter, which already formats it the same way
   * a DTO validation failure would be.
   */
  async create(userId: number, body: unknown, files: Express.Multer.File[]) {
    const input = createCommunicationSchema.parse(body);
    return communicationService.create(input.title, input.body, input.recipientUserIds, input.recipientGroupIds, userId, files);
  }

  async listAll() {
    return communicationService.listAll();
  }

  async listMine(userId: number) {
    return communicationService.listMine(userId);
  }

  async respond(communicationId: number, userId: number, dto: RespondCommunicationDto) {
    await communicationService.respond(communicationId, userId, dto.responseText);
    return {};
  }

  async generateReport(communicationId?: number) {
    return communicationService.generateReport(communicationId);
  }
}
