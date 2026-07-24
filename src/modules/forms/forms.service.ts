import { Injectable } from '@nestjs/common';
import { formService } from './form.service';
import { createFormSchema, distributeFormSchema, submitFormResponseSchema } from '../../validators/form.validator';

/**
 * Thin wrapper around the existing `formService` (src/services/form.service.ts),
 * which already contains all validation/permission logic and throws AppError
 * subclasses (BadRequestError/ForbiddenError/NotFoundError) - the shared
 * AllExceptionsFilter (src/common/filters/all-exceptions.filter.ts) already
 * handles AppError identically to a NestJS HttpException, so that logic is
 * reused as-is rather than re-implemented with Nest exception classes.
 *
 * None of this module's request bodies are translated to class-validator
 * DTOs - every one of form.validator.ts's schemas has either a cross-field/
 * conditional-required rule or a JSON-string-or-array transform (multipart
 * form-data is required wherever file uploads are involved, so array/object
 * fields arrive as JSON strings):
 *  - createFormSchema: each item of `fields` (formFieldInputSchema) has a
 *    `.refine` requiring `options` when fieldType is 'radio'/'select'.
 *  - distributeFormSchema: `.refine` requires at least one of userIds/
 *    groupIds to be non-empty.
 *  - submitFormResponseSchema: `answers` accepts a real array (JSON body) or
 *    a JSON-encoded string (multipart, since file-type form fields force
 *    multipart/form-data), piped into a `.min(1)` array schema.
 * A thrown ZodError propagates to the global AllExceptionsFilter, which
 * already formats it the same way a DTO validation failure would be.
 */
@Injectable()
export class FormsService {
  async create(body: unknown, createdBy: number) {
    const input = createFormSchema.parse(body);
    return formService.create(input, createdBy);
  }

  async list() {
    return formService.list();
  }

  async publish(formId: number) {
    return formService.publish(formId);
  }

  async distribute(formId: number, body: unknown) {
    const { userIds, groupIds } = distributeFormSchema.parse(body);
    return formService.distribute(formId, userIds, groupIds);
  }

  async getFormWithFields(formId: number) {
    return formService.getFormWithFields(formId);
  }

  async listAssignedToMe(userId: number) {
    return formService.listAssignedToMe(userId);
  }

  async submitResponse(formId: number, userId: number, body: unknown, files: Express.Multer.File[]) {
    const { answers } = submitFormResponseSchema.parse(body);
    return formService.submitResponse(formId, userId, answers, files);
  }

  async listResponses(formId: number) {
    return formService.listResponses(formId);
  }

  async exportResponsesToExcel(formId: number) {
    return formService.exportResponsesToExcel(formId);
  }
}
