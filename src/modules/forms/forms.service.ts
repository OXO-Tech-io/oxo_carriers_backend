import { Injectable } from '@nestjs/common';
import { formService } from '../../services/form.service';
import {
  createFormSchema,
  updateFormSchema,
  distributeFormSchema,
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  createQuestionSchema,
  updateQuestionSchema,
  reorderQuestionsSchema,
  createLogicRuleSchema,
  updateLogicRuleSchema,
  updateFormSettingsSchema,
  updateFormThemeSchema,
  submitFormResponseSchema,
  exportResponsesQuerySchema,
} from '../../validators/form.validator';

/**
 * Thin wrapper around the existing `formService` (src/services/form.service.ts),
 * which already contains all validation/permission logic and throws AppError
 * subclasses (BadRequestError/ForbiddenError/NotFoundError) - the shared
 * AllExceptionsFilter (src/common/filters/all-exceptions.filter.ts) already
 * handles AppError identically to a NestJS HttpException, so that logic is
 * reused as-is rather than re-implemented with Nest exception classes.
 *
 * None of this module's request bodies are translated to class-validator DTOs
 * - every one of form.validator.ts's schemas has either a cross-field/
 * conditional-required rule or a JSON-string-or-array transform (multipart
 * form-data is required wherever file uploads are involved, so array/object
 * fields arrive as JSON strings). A thrown ZodError propagates to the global
 * AllExceptionsFilter, which already formats it the same way a DTO validation
 * failure would be.
 */
@Injectable()
export class FormsService {
  // ── Forms ──────────────────────────────────────────────────────────────

  async create(body: unknown, createdBy: number) {
    const input = createFormSchema.parse(body);
    return formService.create(input, createdBy);
  }

  async list() {
    return formService.list();
  }

  async update(formId: number, body: unknown) {
    const input = updateFormSchema.parse(body);
    return formService.update(formId, input);
  }

  async remove(formId: number) {
    return formService.remove(formId);
  }

  async duplicate(formId: number, createdBy: number) {
    return formService.duplicate(formId, createdBy);
  }

  async getFormGraph(formId: number) {
    return formService.getFormGraph(formId);
  }

  async listAssignedToMe(userId: number) {
    return formService.listAssignedToMe(userId);
  }

  async distribute(formId: number, body: unknown) {
    const { userIds, groupIds } = distributeFormSchema.parse(body);
    return formService.distribute(formId, userIds, groupIds);
  }

  // ── Sections ───────────────────────────────────────────────────────────

  async createSection(formId: number, body: unknown) {
    const input = createSectionSchema.parse(body);
    return formService.createSection(formId, input);
  }

  async updateSection(sectionId: number, body: unknown) {
    const input = updateSectionSchema.parse(body);
    return formService.updateSection(sectionId, input);
  }

  async deleteSection(sectionId: number) {
    return formService.deleteSection(sectionId);
  }

  async reorderSections(formId: number, body: unknown) {
    const { sectionIds } = reorderSectionsSchema.parse(body);
    return formService.reorderSections(formId, sectionIds);
  }

  // ── Questions ──────────────────────────────────────────────────────────

  async createQuestion(formId: number, body: unknown) {
    const input = createQuestionSchema.parse(body);
    return formService.createQuestion(formId, input);
  }

  async updateQuestion(questionId: number, body: unknown) {
    const input = updateQuestionSchema.parse(body);
    return formService.updateQuestion(questionId, input);
  }

  async deleteQuestion(questionId: number) {
    return formService.deleteQuestion(questionId);
  }

  async reorderQuestions(formId: number, body: unknown) {
    const { questionIds, sectionId } = reorderQuestionsSchema.parse(body);
    return formService.reorderQuestions(formId, questionIds, sectionId);
  }

  // ── Logic rules ────────────────────────────────────────────────────────

  async createLogicRule(formId: number, body: unknown) {
    const input = createLogicRuleSchema.parse(body);
    return formService.createLogicRule(formId, input);
  }

  async updateLogicRule(ruleId: number, body: unknown) {
    const input = updateLogicRuleSchema.parse(body);
    return formService.updateLogicRule(ruleId, input);
  }

  async deleteLogicRule(ruleId: number) {
    return formService.deleteLogicRule(ruleId);
  }

  // ── Settings & theme ──────────────────────────────────────────────────

  async getSettings(formId: number) {
    return formService.getSettings(formId);
  }

  async updateSettings(formId: number, body: unknown) {
    const input = updateFormSettingsSchema.parse(body);
    return formService.updateSettings(formId, input);
  }

  async getTheme(formId: number) {
    return formService.getTheme(formId);
  }

  async updateTheme(formId: number, body: unknown) {
    const input = updateFormThemeSchema.parse(body);
    return formService.updateTheme(formId, input);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async publish(formId: number) {
    return formService.publish(formId);
  }

  async unpublish(formId: number) {
    return formService.unpublish(formId);
  }

  async archive(formId: number) {
    return formService.archive(formId);
  }

  // ── Responses ──────────────────────────────────────────────────────────

  async submitResponse(formId: number, userId: number, body: unknown, files: Express.Multer.File[]) {
    const { answers, final } = submitFormResponseSchema.parse(body);
    return formService.submitResponse(formId, userId, answers, files, final);
  }

  async listResponses(formId: number) {
    return formService.listResponses(formId);
  }

  async getAnalytics(formId: number) {
    return formService.getAnalytics(formId);
  }

  parseExportFormat(query: unknown): 'csv' | 'xlsx' {
    return exportResponsesQuerySchema.parse(query).format;
  }

  async exportResponsesToExcel(formId: number) {
    return formService.exportResponsesToExcel(formId);
  }

  async exportResponsesToCsv(formId: number) {
    return formService.exportResponsesToCsv(formId);
  }
}
