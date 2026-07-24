import ExcelJS from 'exceljs';
import { FormModel } from '../models/Form';
import { FormSectionModel } from '../models/FormSection';
import { FormQuestionModel } from '../models/FormQuestion';
import { FormQuestionOptionModel } from '../models/FormQuestionOption';
import { FormLogicRuleModel } from '../models/FormLogicRule';
import { FormSettingsModel } from '../models/FormSettings';
import { FormThemeModel } from '../models/FormTheme';
import { FormDistributionModel } from '../models/FormDistribution';
import { FormResponseModel } from '../models/FormResponse';
import { AttachmentModel, type AttachmentFileInput } from '../models/Attachment';
import { UserModel } from '../models/User';
import { groupService } from './group.service';
import { notificationService } from './notification.service';
import { sendFormDistributionEmail } from '../config/email';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/AppError';
import { isQuestionVisible, type LogicRuleLike } from '../utils/formLogic';
import {
  parseQuestionConfig,
  LAYOUT_QUESTION_TYPES,
  ANALYTICS_CHOICE_TYPES,
  ANALYTICS_NUMERIC_TYPES,
  type FormQuestionType,
} from '../validators/formQuestionConfig.validator';
import type {
  CreateFormInput,
  UpdateFormInput,
  CreateSectionInput,
  UpdateSectionInput,
  CreateQuestionInput,
  UpdateQuestionInput,
  CreateLogicRuleInput,
  UpdateLogicRuleInput,
  UpdateFormSettingsInput,
  UpdateFormThemeInput,
} from '../validators/form.validator';
import type { FormQuestion as DrizzleFormQuestion, FormQuestionOption as DrizzleFormQuestionOption } from '../db/schema';

type QuestionWithOptions = DrizzleFormQuestion & { options: DrizzleFormQuestionOption[] };

// Matches the fallback used in config/email.ts for other portal links.
const FRONTEND_FALLBACK = 'https://oxo-carriers-frontend-297614602590.us-central1.run.app';

/** Loads options for many questions in one flat query and merges them in, avoiding an N+1. */
async function attachOptions(questions: DrizzleFormQuestion[]): Promise<QuestionWithOptions[]> {
  const options = await FormQuestionOptionModel.listByQuestionIds(questions.map((q) => q.id));
  const byQuestion = new Map<number, DrizzleFormQuestionOption[]>();
  for (const o of options) {
    const list = byQuestion.get(o.questionId) ?? [];
    list.push(o);
    byQuestion.set(o.questionId, list);
  }
  return questions.map((q) => ({ ...q, options: byQuestion.get(q.id) ?? [] }));
}

/** Flattened text mirror of a structured answer value, used for value_text/CSV/XLSX/search. */
const flattenAnswerText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([row, col]) => `${row}: ${Array.isArray(col) ? col.join('/') : String(col)}`)
      .join('; ');
  }
  return String(value);
};

const isValuePresent = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
};

/** Validates a provided answer's shape/value against its question's type + config + options. */
function validateAnswerAgainstQuestion(question: QuestionWithOptions, value: unknown): void {
  if (!isValuePresent(value)) return;
  const type = question.type as FormQuestionType;
  const config = (question.config ?? {}) as Record<string, unknown>;
  const optionValues = new Set(question.options.map((o) => o.value));
  const allowOther = config.allowOther === true;

  const checkChoiceValue = (v: unknown) => {
    if (typeof v !== 'string') throw new BadRequestError(`Invalid value for "${question.title}"`);
    if (!optionValues.has(v) && !allowOther) throw new BadRequestError(`Invalid value for "${question.title}"`);
  };

  switch (type) {
    case 'multiple_choice':
    case 'dropdown':
      checkChoiceValue(value);
      break;
    case 'checkboxes': {
      if (!Array.isArray(value)) throw new BadRequestError(`Invalid value for "${question.title}"`);
      value.forEach(checkChoiceValue);
      const min = typeof config.minSelections === 'number' ? config.minSelections : undefined;
      const max = typeof config.maxSelections === 'number' ? config.maxSelections : undefined;
      if (min !== undefined && value.length < min) {
        throw new BadRequestError(`"${question.title}" requires at least ${min} selection(s)`);
      }
      if (max !== undefined && value.length > max) {
        throw new BadRequestError(`"${question.title}" allows at most ${max} selection(s)`);
      }
      break;
    }
    case 'yes_no': {
      // The fill-form UI (QuestionField.tsx) sends the literal option labels "Yes"/"No", not
      // lowercase or booleans - match case-insensitively so submissions from that UI validate.
      const ok = typeof value === 'boolean' || (typeof value === 'string' && ['yes', 'no'].includes(value.toLowerCase()));
      if (!ok) throw new BadRequestError(`Invalid value for "${question.title}"`);
      break;
    }
    case 'multiple_choice_grid':
    case 'checkbox_grid': {
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        throw new BadRequestError(`Invalid value for "${question.title}"`);
      }
      const columns = Array.isArray(config.columns) ? (config.columns as string[]) : [];
      for (const [row, col] of Object.entries(value as Record<string, unknown>)) {
        if (!optionValues.has(row)) throw new BadRequestError(`Invalid row for "${question.title}"`);
        const cols = Array.isArray(col) ? col : [col];
        for (const c of cols) {
          if (!columns.includes(String(c))) throw new BadRequestError(`Invalid column for "${question.title}"`);
        }
      }
      break;
    }
    case 'linear_scale': {
      const num = Number(value);
      const min = typeof config.min === 'number' ? config.min : 1;
      const max = typeof config.max === 'number' ? config.max : 5;
      if (Number.isNaN(num) || num < min || num > max) {
        throw new BadRequestError(`"${question.title}" must be between ${min} and ${max}`);
      }
      break;
    }
    case 'rating': {
      const num = Number(value);
      const max = typeof config.max === 'number' ? config.max : 5;
      if (Number.isNaN(num) || num < 1 || num > max) {
        throw new BadRequestError(`"${question.title}" must be between 1 and ${max}`);
      }
      break;
    }
    case 'number': {
      const num = Number(value);
      if (Number.isNaN(num)) throw new BadRequestError(`"${question.title}" must be a number`);
      if (typeof config.min === 'number' && num < config.min) {
        throw new BadRequestError(`"${question.title}" must be at least ${config.min}`);
      }
      if (typeof config.max === 'number' && num > config.max) {
        throw new BadRequestError(`"${question.title}" must be at most ${config.max}`);
      }
      break;
    }
    case 'short_answer':
    case 'paragraph': {
      if (typeof value !== 'string') throw new BadRequestError(`Invalid value for "${question.title}"`);
      const maxLength = typeof config.maxLength === 'number' ? config.maxLength : undefined;
      if (maxLength !== undefined && value.length > maxLength) {
        throw new BadRequestError(`"${question.title}" exceeds the maximum length of ${maxLength}`);
      }
      break;
    }
    case 'email': {
      if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new BadRequestError(`"${question.title}" must be a valid email address`);
      }
      break;
    }
    case 'url': {
      if (typeof value !== 'string') throw new BadRequestError(`Invalid value for "${question.title}"`);
      try {
        // eslint-disable-next-line no-new
        new URL(value);
      } catch {
        throw new BadRequestError(`"${question.title}" must be a valid URL`);
      }
      break;
    }
    default:
      break; // date/time/datetime/file_upload: no further shape validation here
  }
}

const countBy = (values: string[]): { label: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
};

const csvEscape = (value: unknown): string => {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const formService = {
  // ── Forms ────────────────────────────────────────────────────────────────

  async create(input: CreateFormInput, createdBy: number) {
    const form = await FormModel.create({ title: input.title, description: input.description ?? null, createdBy });
    await FormSettingsModel.createDefault(form.id);
    if (input.closeAt) {
      await FormSettingsModel.update(form.id, { closeAt: input.closeAt });
    }
    await FormThemeModel.createDefault(form.id);
    return form;
  },

  async list() {
    const allForms = await FormModel.listAll();
    const results = await Promise.all(
      allForms.map(async (form) => {
        const settings = await FormSettingsModel.findByFormId(form.id);
        return {
          ...form,
          closeAt: settings?.closeAt ?? null,
        };
      })
    );
    return results;
  },

  async update(formId: number, input: UpdateFormInput) {
    const existing = await FormModel.findById(formId);
    if (!existing) throw new NotFoundError('Form not found');
    const updated = await FormModel.update(formId, input);
    if (!updated) throw new NotFoundError('Form not found');
    return updated;
  },

  async remove(formId: number) {
    const existing = await FormModel.findById(formId);
    if (!existing) throw new NotFoundError('Form not found');
    await FormModel.delete(formId); // cascading FKs handle sections/questions/options/logic/settings/theme/distributions/responses
  },

  async duplicate(formId: number, createdBy: number) {
    const graph = await this.getFormGraph(formId);
    const [settings, theme] = await Promise.all([
      FormSettingsModel.findByFormId(formId),
      FormThemeModel.findByFormId(formId),
    ]);

    const copy = await FormModel.create({
      title: `${graph.form.title} (Copy)`,
      description: graph.form.description,
      createdBy,
    });
    await FormSettingsModel.createDefault(copy.id);
    await FormThemeModel.createDefault(copy.id);

    const sectionIdMap = new Map<number, number>();
    for (const section of graph.sections) {
      const newSection = await FormSectionModel.create({
        formId: copy.id,
        title: section.title,
        description: section.description,
        orderIndex: section.orderIndex,
      });
      sectionIdMap.set(section.id, newSection.id);
    }

    const questionIdMap = new Map<number, number>();
    for (const question of graph.questions) {
      const newQuestion = await FormQuestionModel.create({
        formId: copy.id,
        sectionId: question.sectionId != null ? (sectionIdMap.get(question.sectionId) ?? null) : null,
        type: question.type,
        title: question.title,
        description: question.description,
        helpText: question.helpText,
        placeholder: question.placeholder,
        required: question.required,
        orderIndex: question.orderIndex,
        config: (question.config as Record<string, unknown>) ?? {},
        defaultValue: question.defaultValue,
      });
      questionIdMap.set(question.id, newQuestion.id);
      if (question.options.length) {
        await FormQuestionOptionModel.createMany(
          question.options.map((o) => ({
            questionId: newQuestion.id,
            label: o.label,
            value: o.value,
            orderIndex: o.orderIndex,
            isOther: o.isOther,
          }))
        );
      }
    }

    for (const rule of graph.logicRules) {
      const targetId = questionIdMap.get(rule.targetQuestionId);
      const sourceId = questionIdMap.get(rule.sourceQuestionId);
      if (!targetId || !sourceId) continue;
      await FormLogicRuleModel.create({
        formId: copy.id,
        targetQuestionId: targetId,
        sourceQuestionId: sourceId,
        comparator: rule.comparator,
        comparisonValue: rule.comparisonValue,
        action: rule.action,
        combinator: rule.combinator,
        orderIndex: rule.orderIndex,
      });
    }

    if (settings) {
      await FormSettingsModel.update(copy.id, {
        thankYouMessage: settings.thankYouMessage,
        acceptResponses: settings.acceptResponses,
        allowEditAfterSubmit: settings.allowEditAfterSubmit,
        notifyOwnerOnResponse: settings.notifyOwnerOnResponse,
        notifyRespondent: settings.notifyRespondent,
      });
    }
    if (theme) {
      await FormThemeModel.update(copy.id, { primaryColor: theme.primaryColor, headerImageUrl: theme.headerImageUrl });
    }

    return this.getFormGraph(copy.id);
  },

  /** Full graph in one call: form + sections + questions(+options) + logic_rules (mirrors Marketrix's formGet, avoids builder waterfall fetches). */
  async getFormGraph(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const [sections, questions, logicRules] = await Promise.all([
      FormSectionModel.listByFormId(formId),
      FormQuestionModel.listByFormId(formId),
      FormLogicRuleModel.listByFormId(formId),
    ]);
    const questionsWithOptions = await attachOptions(questions);
    return { form, sections, questions: questionsWithOptions, logicRules };
  },

  async listAssignedToMe(userId: number) {
    const distributions = await FormDistributionModel.listByUserId(userId);
    const results = await Promise.all(
      distributions.map(async (dist) => {
        const form = await FormModel.findById(dist.formId);
        const response = await FormResponseModel.findByFormAndUser(dist.formId, userId);
        const settings = form ? await FormSettingsModel.findByFormId(dist.formId) : null;
        return {
          form: form ? { ...form, closeAt: settings?.closeAt ?? null } : null,
          distributedAt: dist.distributedAt,
          submitted: response?.status === 'submitted',
          responseStatus: response?.status ?? null,
          // Flattened so the frontend can filter to accepting forms without a per-form fetch.
          acceptResponses: settings?.acceptResponses ?? true,
          closeAt: settings?.closeAt ?? null,
        };
      })
    );
    return results.filter((r) => r.form);
  },

  /**
   * Lets the fill-form UI check, before rendering the editable form, whether this employee
   * already has a response and whether they're allowed to keep editing it - so an employee who
   * already submitted (and can't resubmit per `submitResponse`'s own check) sees a read-only view
   * of what they submitted instead of a form that will just reject them on click.
   */
  async getMyResponse(formId: number, userId: number) {
    const isDistributed = await FormDistributionModel.isDistributedTo(formId, userId);
    if (!isDistributed) throw new ForbiddenError('This form was not assigned to you');
    const response = await FormResponseModel.findByFormAndUser(formId, userId);
    const answers = response ? await FormResponseModel.listAnswersByResponseId(response.id) : [];
    const settings = await FormSettingsModel.findByFormId(formId);
    return { response, answers, allowEditAfterSubmit: settings?.allowEditAfterSubmit ?? false };
  },

  // ── Sections ─────────────────────────────────────────────────────────────

  async createSection(formId: number, input: CreateSectionInput) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const orderIndex = await FormSectionModel.nextOrderIndex(formId);
    return FormSectionModel.create({ formId, title: input.title ?? '', description: input.description ?? null, orderIndex });
  },

  async updateSection(sectionId: number, input: UpdateSectionInput) {
    const existing = await FormSectionModel.findById(sectionId);
    if (!existing) throw new NotFoundError('Section not found');
    const updated = await FormSectionModel.update(sectionId, input);
    if (!updated) throw new NotFoundError('Section not found');
    return updated;
  },

  async deleteSection(sectionId: number) {
    const existing = await FormSectionModel.findById(sectionId);
    if (!existing) throw new NotFoundError('Section not found');
    await FormSectionModel.delete(sectionId);
  },

  async reorderSections(formId: number, sectionIds: number[]) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    await FormSectionModel.reorder(formId, sectionIds);
  },

  // ── Questions ────────────────────────────────────────────────────────────

  async createQuestion(formId: number, input: CreateQuestionInput) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    if (input.sectionId != null) {
      const section = await FormSectionModel.findById(input.sectionId);
      if (!section || section.formId !== formId) throw new BadRequestError('Invalid sectionId');
    }
    const config = parseQuestionConfig(input.type, input.config);
    const orderIndex = await FormQuestionModel.nextOrderIndex(formId);
    const question = await FormQuestionModel.create({
      formId,
      sectionId: input.sectionId ?? null,
      type: input.type,
      title: input.title ?? '',
      description: input.description ?? null,
      helpText: input.helpText ?? null,
      placeholder: input.placeholder ?? null,
      required: input.required ?? false,
      orderIndex,
      config,
      defaultValue: input.defaultValue ?? null,
    });
    const options = input.options.length
      ? await FormQuestionOptionModel.createMany(
          input.options.map((o, i) => ({
            questionId: question.id,
            label: o.label,
            value: o.value ?? o.label,
            orderIndex: i,
            isOther: o.isOther ?? false,
          }))
        )
      : [];
    return { ...question, options };
  },

  async updateQuestion(questionId: number, input: UpdateQuestionInput) {
    const existing = await FormQuestionModel.findById(questionId);
    if (!existing) throw new NotFoundError('Question not found');
    if (input.sectionId !== undefined && input.sectionId != null) {
      const section = await FormSectionModel.findById(input.sectionId);
      if (!section || section.formId !== existing.formId) throw new BadRequestError('Invalid sectionId');
    }

    let config: Record<string, unknown> | undefined;
    if (input.config !== undefined || input.type !== undefined) {
      const effectiveType = (input.type ?? existing.type) as FormQuestionType;
      config = parseQuestionConfig(effectiveType, input.config ?? (existing.config as Record<string, unknown>));
    }

    await FormQuestionModel.update(questionId, {
      sectionId: input.sectionId,
      type: input.type,
      title: input.title,
      description: input.description,
      helpText: input.helpText,
      placeholder: input.placeholder,
      required: input.required,
      config,
      defaultValue: input.defaultValue,
    });

    if (input.options !== undefined) {
      const existingOptions = await FormQuestionOptionModel.listByQuestionId(questionId);
      const keepIds = new Set(input.options.map((o) => o.id).filter((id): id is number => id != null));
      const toRemove = existingOptions.filter((o) => !keepIds.has(o.id));
      if (toRemove.length) await FormQuestionOptionModel.deleteMany(toRemove.map((o) => o.id));

      for (const [orderIndex, opt] of input.options.entries()) {
        if (opt.id != null) {
          await FormQuestionOptionModel.update(opt.id, {
            label: opt.label,
            value: opt.value ?? opt.label,
            isOther: opt.isOther ?? false,
            orderIndex,
          });
        } else {
          await FormQuestionOptionModel.create({
            questionId,
            label: opt.label,
            value: opt.value ?? opt.label,
            orderIndex,
            isOther: opt.isOther ?? false,
          });
        }
      }
    }

    const updated = await FormQuestionModel.findById(questionId);
    if (!updated) throw new NotFoundError('Question not found');
    const options = await FormQuestionOptionModel.listByQuestionId(questionId);
    return { ...updated, options };
  },

  async deleteQuestion(questionId: number) {
    const existing = await FormQuestionModel.findById(questionId);
    if (!existing) throw new NotFoundError('Question not found');
    await FormQuestionModel.delete(questionId);
  },

  async reorderQuestions(formId: number, questionIds: number[], sectionId?: number | null) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    await FormQuestionModel.reorder(formId, questionIds, sectionId);
  },

  // ── Logic rules ──────────────────────────────────────────────────────────

  async createLogicRule(formId: number, input: CreateLogicRuleInput) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const [target, source] = await Promise.all([
      FormQuestionModel.findById(input.targetQuestionId),
      FormQuestionModel.findById(input.sourceQuestionId),
    ]);
    if (!target || target.formId !== formId) throw new BadRequestError('Invalid targetQuestionId');
    if (!source || source.formId !== formId) throw new BadRequestError('Invalid sourceQuestionId');

    const orderIndex = await FormLogicRuleModel.countByFormId(formId);
    return FormLogicRuleModel.create({
      formId,
      targetQuestionId: input.targetQuestionId,
      sourceQuestionId: input.sourceQuestionId,
      comparator: input.comparator,
      comparisonValue: input.comparisonValue,
      action: input.action,
      combinator: input.combinator,
      orderIndex,
    });
  },

  async updateLogicRule(ruleId: number, input: UpdateLogicRuleInput) {
    const existing = await FormLogicRuleModel.findById(ruleId);
    if (!existing) throw new NotFoundError('Logic rule not found');
    const updated = await FormLogicRuleModel.update(ruleId, input);
    if (!updated) throw new NotFoundError('Logic rule not found');
    return updated;
  },

  async deleteLogicRule(ruleId: number) {
    const existing = await FormLogicRuleModel.findById(ruleId);
    if (!existing) throw new NotFoundError('Logic rule not found');
    await FormLogicRuleModel.delete(ruleId);
  },

  // ── Settings & theme ─────────────────────────────────────────────────────

  async getSettings(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const settings = await FormSettingsModel.findByFormId(formId);
    if (!settings) throw new NotFoundError('Form settings not found');
    return settings;
  },

  async updateSettings(formId: number, input: UpdateFormSettingsInput) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const updated = await FormSettingsModel.update(formId, input);
    if (!updated) throw new NotFoundError('Form settings not found');
    return updated;
  },

  async getTheme(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const theme = await FormThemeModel.findByFormId(formId);
    if (!theme) throw new NotFoundError('Form theme not found');
    return theme;
  },

  async updateTheme(formId: number, input: UpdateFormThemeInput) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const updated = await FormThemeModel.update(formId, input);
    if (!updated) throw new NotFoundError('Form theme not found');
    return updated;
  },

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async publish(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const questionCount = await FormQuestionModel.countByFormId(formId);
    if (questionCount === 0) throw new BadRequestError('Add at least one question before publishing');
    const published = await FormModel.publish(formId);
    if (!published) throw new NotFoundError('Form not found');
    return published;
  },

  async unpublish(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const updated = await FormModel.unpublish(formId);
    if (!updated) throw new NotFoundError('Form not found');
    return updated;
  },

  async archive(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const updated = await FormModel.archive(formId);
    if (!updated) throw new NotFoundError('Form not found');
    return updated;
  },

  // ── Distribution ─────────────────────────────────────────────────────────

  async distribute(formId: number, userIds: number[], groupIds: number[] = [], closeAt?: Date | null) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    if (closeAt !== undefined) {
      await FormSettingsModel.update(formId, { closeAt });
    }
    const groupMemberIds = await groupService.resolveMemberUserIds(groupIds);
    const resolvedUserIds = [...new Set([...userIds, ...groupMemberIds])];
    const distributions = await FormDistributionModel.createMany(formId, resolvedUserIds);
    await notificationService.notifyMany(
      resolvedUserIds,
      'form',
      `New form: ${form.title}`,
      'HR has assigned you a form to fill out.',
      { formId },
      `/my-forms/${formId}`
    );

    // Fire-and-forget distribution email per recipient (matches communicationService.create's
    // pattern) - never blocks or fails the distribute request if SMTP has a hiccup.
    const ctaUrl = `${env.FRONTEND_URL ?? FRONTEND_FALLBACK}/my-forms/${formId}`;
    for (const userId of resolvedUserIds) {
      (async () => {
        try {
          const user = await UserModel.findById(userId);
          if (user?.email) {
            await sendFormDistributionEmail(user.email, {
              respondentName: `${user.firstName} ${user.lastName}`.trim() || 'there',
              formTitle: form.title,
              ctaUrl,
            });
          }
        } catch (err) {
          logger.error({ err, userId, formId }, 'Failed to send form distribution email');
        }
      })();
    }

    return distributions;
  },

  // ── Responses ────────────────────────────────────────────────────────────

  /**
   * Handles both autosave (`final=false`, no required/logic validation, just persists whatever
   * was answered so far) and final submit (`final=true`, fully validated: every visible-and-
   * required question must be answered, and every provided answer must fit its question's
   * type/config/options). Visibility is resolved with the same show/hide evaluator the frontend
   * uses (src/utils/formLogic.ts) - closing a gap the Marketrix reference implementation never
   * closed server-side (see plan).
   */
  async submitResponse(
    formId: number,
    userId: number,
    answers: { questionId: number; value?: unknown }[],
    files: AttachmentFileInput[],
    final: boolean
  ) {
    const isDistributed = await FormDistributionModel.isDistributedTo(formId, userId);
    if (!isDistributed) throw new ForbiddenError('This form was not assigned to you');

    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    if (form.status !== 'published') throw new BadRequestError('This form is not accepting responses');

    const settings = await FormSettingsModel.findByFormId(formId);
    if (settings && !settings.acceptResponses) throw new BadRequestError('This form is not accepting responses');

    const existing = await FormResponseModel.findByFormAndUser(formId, userId);
    if (existing?.status === 'submitted' && !settings?.allowEditAfterSubmit) {
      throw new BadRequestError('You have already submitted a response for this form');
    }
    if (!existing && settings?.responseLimit != null && form.responseCount >= settings.responseLimit) {
      throw new BadRequestError('This form has reached its response limit');
    }

    const response = existing ?? (await FormResponseModel.createInProgress(formId, userId));

    const questions = await FormQuestionModel.listByFormId(formId);
    const questionsWithOptions = await attachOptions(questions);
    const questionById = new Map(questionsWithOptions.map((q) => [q.id, q]));
    const logicRules = await FormLogicRuleModel.listByFormId(formId);
    const logicRulesLike: LogicRuleLike[] = logicRules.map((r) => ({
      targetQuestionId: r.targetQuestionId,
      sourceQuestionId: r.sourceQuestionId,
      comparator: r.comparator,
      comparisonValue: r.comparisonValue,
      action: r.action,
      combinator: r.combinator,
    }));

    const fileQuestionIds = new Map<number, AttachmentFileInput[]>();
    for (const file of files) {
      const questionId = Number(file.fieldname.replace('question_', ''));
      if (Number.isNaN(questionId) || !questionById.has(questionId)) continue;
      const list = fileQuestionIds.get(questionId) ?? [];
      list.push(file);
      fileQuestionIds.set(questionId, list);
    }

    // Full current-answer snapshot (existing DB state overridden by this submission's payload) -
    // used to evaluate logic-rule visibility, which needs every question's current value, not
    // just the ones included in this particular autosave/submit call.
    const existingAnswers = existing ? await FormResponseModel.listAnswersByResponseId(response.id) : [];
    const answersMap = new Map<number, unknown>();
    for (const a of existingAnswers) answersMap.set(a.questionId, a.value);
    for (const a of answers) {
      const question = questionById.get(a.questionId);
      if (question && !LAYOUT_QUESTION_TYPES.includes(question.type as FormQuestionType)) {
        answersMap.set(a.questionId, a.value ?? null);
      }
    }
    for (const questionId of fileQuestionIds.keys()) {
      answersMap.set(questionId, fileQuestionIds.get(questionId)?.map((f) => f.originalname) ?? []);
    }

    if (final) {
      for (const question of questionsWithOptions) {
        if (LAYOUT_QUESTION_TYPES.includes(question.type as FormQuestionType)) continue;
        const visible = isQuestionVisible(question.id, logicRulesLike, Object.fromEntries(answersMap));
        if (!visible) continue;

        const value = answersMap.get(question.id);
        if (question.required && !isValuePresent(value)) {
          throw new BadRequestError(`"${question.title}" is required`);
        }
        if (question.type !== 'file_upload') {
          validateAnswerAgainstQuestion(question, value);
        }
      }
    }

    // Persist every answer included in this call (draft or final).
    for (const a of answers) {
      const question = questionById.get(a.questionId);
      if (!question || LAYOUT_QUESTION_TYPES.includes(question.type as FormQuestionType)) continue;
      if (question.type === 'file_upload') continue; // handled below, alongside any uploaded files
      await FormResponseModel.upsertAnswer({
        responseId: response.id,
        questionId: a.questionId,
        valueText: flattenAnswerText(a.value),
        value: a.value ?? null,
      });
    }

    for (const [questionId, questionFiles] of fileQuestionIds.entries()) {
      const filenames = questionFiles.map((f) => f.originalname);
      const answer = await FormResponseModel.upsertAnswer({
        responseId: response.id,
        questionId,
        valueText: filenames.join(', '),
        value: filenames,
      });
      await AttachmentModel.createMany('form_response_answer', answer.id, questionFiles, userId);
    }

    let isFirstSubmission = false;
    if (final) {
      isFirstSubmission = !existing || existing.status !== 'submitted';
      const startedAt = response.startedAt ? new Date(response.startedAt).getTime() : Date.now();
      const completionMs = Math.max(0, Date.now() - startedAt);
      await FormResponseModel.markSubmitted(response.id, completionMs);
      if (isFirstSubmission) {
        await FormModel.incrementResponseCount(formId);
        // In-app notification only (matches how `distribute` above fires notificationService
        // directly) - the actual email is sent non-blocking from the Nest controller, following
        // the leaves.controller.ts pattern (see FormsController.submitResponse).
        if (settings?.notifyOwnerOnResponse && form.createdBy) {
          await notificationService.notify(
            form.createdBy,
            'form_response',
            `New response: ${form.title}`,
            'An employee submitted a response to your form.',
            { formId, responseId: response.id },
            `/admin/forms/${formId}/responses`
          );
        }
      }
    }

    const finalResponse = await FormResponseModel.findById(response.id);
    const [respondent, owner] = await Promise.all([
      UserModel.findById(userId),
      form.createdBy != null ? UserModel.findById(form.createdBy) : Promise.resolve(null),
    ]);
    return { response: finalResponse ?? response, form, isFirstSubmission, settings, respondent, owner };
  },

  async listResponses(formId: number) {
    const responses = await FormResponseModel.listByFormId(formId);
    return Promise.all(
      responses.map(async (response) => {
        const answers = await FormResponseModel.listAnswersByResponseId(response.id);
        const user = await UserModel.findById(response.userId);
        return { response, answers, user };
      })
    );
  },

  // ── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');

    const responses = await FormResponseModel.listByFormId(formId);
    const submitted = responses.filter((r) => r.status === 'submitted');
    const inProgress = responses.filter((r) => r.status === 'in_progress');
    const totalStarted = responses.length;

    const trendMap = new Map<string, number>();
    for (const r of submitted) {
      if (!r.submittedAt) continue;
      const day = new Date(r.submittedAt).toISOString().slice(0, 10);
      trendMap.set(day, (trendMap.get(day) ?? 0) + 1);
    }
    const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

    const questions = await FormQuestionModel.listByFormId(formId);
    const responseIds = submitted.map((r) => r.id);
    const answersByResponse = await Promise.all(responseIds.map((id) => FormResponseModel.listAnswersByResponseId(id)));
    const answers = answersByResponse.flat();
    const answersByQuestion = new Map<number, typeof answers>();
    for (const a of answers) {
      const list = answersByQuestion.get(a.questionId) ?? [];
      list.push(a);
      answersByQuestion.set(a.questionId, list);
    }

    const perQuestion = questions
      .filter((q) => !LAYOUT_QUESTION_TYPES.includes(q.type as FormQuestionType))
      .map((q) => {
        const qAnswers = answersByQuestion.get(q.id) ?? [];
        let distribution: { label: string; count: number }[] | undefined;
        if (ANALYTICS_CHOICE_TYPES.includes(q.type as FormQuestionType)) {
          const flat: string[] = [];
          for (const a of qAnswers) {
            const value = a.value;
            for (const v of Array.isArray(value) ? value : [value]) if (v != null) flat.push(String(v));
          }
          distribution = countBy(flat);
        } else if (ANALYTICS_NUMERIC_TYPES.includes(q.type as FormQuestionType)) {
          distribution = countBy(qAnswers.map((a) => String(Number(a.value))).filter((v) => v !== 'NaN'));
        }
        return { questionId: q.id, title: q.title, type: q.type, responseCount: qAnswers.length, distribution };
      });

    return {
      totalResponses: submitted.length,
      totalStarted,
      completionRate: totalStarted > 0 ? submitted.length / totalStarted : 0,
      dropOffRate: totalStarted > 0 ? inProgress.length / totalStarted : 0,
      avgCompletionMs:
        submitted.length > 0 ? submitted.reduce((sum, r) => sum + (r.completionMs ?? 0), 0) / submitted.length : 0,
      trend,
      perQuestion,
    };
  },

  // ── Export ───────────────────────────────────────────────────────────────

  async exportResponsesToExcel(formId: number): Promise<ExcelJS.Buffer> {
    const { form, questions } = await this.getFormGraph(formId);
    const responses = await this.listResponses(formId);
    const answerable = questions.filter((q) => !LAYOUT_QUESTION_TYPES.includes(q.type as FormQuestionType));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(form.title.slice(0, 31) || 'Responses');
    worksheet.columns = [
      { header: 'Submitted By', key: 'submittedBy', width: 30 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Submitted At', key: 'submittedAt', width: 22 },
      ...answerable.map((q) => ({ header: q.title || `Question ${q.id}`, key: `question_${q.id}`, width: 30 })),
    ];
    worksheet.getRow(1).font = { bold: true };

    for (const { response, answers, user } of responses) {
      const row: Record<string, string> = {
        submittedBy: user ? `${user.firstName} ${user.lastName}` : `User #${response.userId}`,
        status: response.status,
        submittedAt: response.submittedAt ? new Date(response.submittedAt).toLocaleString() : '',
      };
      for (const question of answerable) {
        const answer = answers.find((a) => a.questionId === question.id);
        row[`question_${question.id}`] = answer?.valueText ?? '';
      }
      worksheet.addRow(row);
    }

    return workbook.xlsx.writeBuffer();
  },

  async exportResponsesToCsv(formId: number): Promise<string> {
    const { questions } = await this.getFormGraph(formId);
    const responses = await this.listResponses(formId);
    const answerable = questions.filter((q) => !LAYOUT_QUESTION_TYPES.includes(q.type as FormQuestionType));

    const headers = ['Submitted By', 'Status', 'Submitted At', ...answerable.map((q) => q.title || `Question ${q.id}`)];
    const lines = [headers.map(csvEscape).join(',')];

    for (const { response, answers, user } of responses) {
      const cells = [
        user ? `${user.firstName} ${user.lastName}` : `User #${response.userId}`,
        response.status,
        response.submittedAt ? new Date(response.submittedAt).toLocaleString() : '',
        ...answerable.map((q) => answers.find((a) => a.questionId === q.id)?.valueText ?? ''),
      ];
      lines.push(cells.map(csvEscape).join(','));
    }

    return lines.join('\r\n');
  },
};
