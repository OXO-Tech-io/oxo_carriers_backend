import { Injectable } from '@nestjs/common';
import { formService } from './form.service';
import {
  createFormSchema,
  updateFormSchema,
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  createQuestionSchema,
  updateQuestionSchema,
  reorderQuestionsSchema,
  createLogicRuleSchema,
  updateLogicRuleSchema,
  updateSettingsSchema,
  updateThemeSchema,
  distributeFormSchema,
  submitFormResponseSchema,
} from '../../validators/form.validator';

/**
 * Thin wrapper around the existing `formService` (form.service.ts), which
 * already contains all validation/permission logic and throws AppError
 * subclasses (BadRequestError/ForbiddenError/NotFoundError) - the shared
 * AllExceptionsFilter handles AppError identically to a NestJS HttpException,
 * so that logic is reused as-is rather than re-implemented with Nest
 * exception classes. Every schema here is raw Zod rather than a
 * class-validator DTO for the same reasons as the rest of this module: loose
 * per-question-type `config`/`defaultValue`/`comparisonValue` fields, and
 * multipart-form-data string coercion wherever files are involved.
 */
@Injectable()
export class FormsService {
  async create(body: unknown, createdBy: number) {
    const input = createFormSchema.parse(body);
    return formService.create(input, createdBy);
  }

  async update(formId: number, body: unknown) {
    const input = updateFormSchema.parse(body);
    return formService.update(formId, input);
  }

  async list() {
    return formService.list();
  }

  async getFormWithGraph(formId: number) {
    return formService.getFormWithGraph(formId);
  }

  async delete(formId: number) {
    return formService.delete(formId);
  }

  async duplicate(formId: number, createdBy: number) {
    return formService.duplicate(formId, createdBy);
  }

  async publish(formId: number) {
    return formService.publish(formId);
  }

  async unpublish(formId: number) {
    return formService.unpublish(formId);
  }

  async archive(formId: number) {
    return formService.archive(formId);
  }

  async distribute(formId: number, body: unknown) {
    const { userIds, groupIds, closeAt } = distributeFormSchema.parse(body);
    return formService.distribute(formId, userIds, groupIds, closeAt);
  }

  async createSection(formId: number, body: unknown) {
    const input = createSectionSchema.parse(body);
    return formService.createSection(formId, input);
  }

  async updateSection(id: number, body: unknown) {
    const input = updateSectionSchema.parse(body);
    return formService.updateSection(id, input);
  }

  async deleteSection(id: number) {
    return formService.deleteSection(id);
  }

  async reorderSections(body: unknown) {
    const { sectionIds } = reorderSectionsSchema.parse(body);
    return formService.reorderSections(sectionIds);
  }

  async createQuestion(formId: number, body: unknown) {
    const input = createQuestionSchema.parse(body);
    return formService.createQuestion(formId, input);
  }

  async updateQuestion(id: number, body: unknown) {
    const input = updateQuestionSchema.parse(body);
    return formService.updateQuestion(id, input);
  }

  async deleteQuestion(id: number) {
    return formService.deleteQuestion(id);
  }

  async reorderQuestions(body: unknown) {
    const { questionIds } = reorderQuestionsSchema.parse(body);
    return formService.reorderQuestions(questionIds);
  }

  async createLogicRule(formId: number, body: unknown) {
    const input = createLogicRuleSchema.parse(body);
    return formService.createLogicRule(formId, input);
  }

  async updateLogicRule(id: number, body: unknown) {
    const input = updateLogicRuleSchema.parse(body);
    return formService.updateLogicRule(id, input);
  }

  async deleteLogicRule(id: number) {
    return formService.deleteLogicRule(id);
  }

  async getSettings(formId: number) {
    return formService.getSettings(formId);
  }

  async updateSettings(formId: number, body: unknown) {
    const input = updateSettingsSchema.parse(body);
    return formService.updateSettings(formId, input);
  }

  async getTheme(formId: number) {
    return formService.getTheme(formId);
  }

  async updateTheme(formId: number, body: unknown, file?: Express.Multer.File) {
    const input = updateThemeSchema.parse(body);
    return formService.updateTheme(formId, input, file);
  }

  async getAnalytics(formId: number) {
    return formService.getAnalytics(formId);
  }

  async listAssignedToMe(userId: number) {
    return formService.listAssignedToMe(userId);
  }

  async getMyResponse(formId: number, userId: number) {
    return formService.getMyResponse(formId, userId);
  }

  async submitResponse(formId: number, userId: number, body: unknown, files: Express.Multer.File[]) {
    const { answers, final } = submitFormResponseSchema.parse(body);
    return formService.submitResponse(formId, userId, answers, files, final);
  }

  async listResponses(formId: number) {
    return formService.listResponses(formId);
  }

  async exportResponses(formId: number, format: 'xlsx' | 'csv') {
    return formService.exportResponses(formId, format);
  }
}
