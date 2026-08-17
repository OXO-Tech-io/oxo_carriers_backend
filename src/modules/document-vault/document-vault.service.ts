import { Injectable } from '@nestjs/common';
import { documentService } from './document.service';
import { createDocumentSchema } from '../../validators/document.validator';

/**
 * Thin wrapper around the existing `documentService`, which already
 * contains all validation/business logic and throws AppError subclasses -
 * the shared AllExceptionsFilter already handles AppError identically to a
 * NestJS HttpException, so that logic is reused as-is rather than
 * re-implemented with Nest exception classes. Mirrors
 * communications.service.ts's split for the same reason: `createDocumentSchema`
 * has a cross-field `.refine` and a transform that accepts either a real
 * array or a JSON-encoded string (required because file attachments force
 * multipart/form-data, where array fields arrive as strings).
 */
@Injectable()
export class DocumentVaultService {
  async create(userId: number, body: unknown, files: Express.Multer.File[]) {
    const input = createDocumentSchema.parse(body);
    return documentService.create(
      input.title,
      input.description ?? null,
      input.targetType,
      input.individualEmployeeIds,
      userId,
      files,
    );
  }

  async listAll(page: number, pageSize: number) {
    return documentService.listAll(page, pageSize);
  }

  async listForEmployee(employeeId: string) {
    return documentService.listForEmployee(employeeId);
  }

  async listForEmployeeByInternalId(internalId: number) {
    return documentService.listForEmployeeByInternalId(internalId);
  }

  async delete(documentId: number) {
    return documentService.delete(documentId);
  }
}
