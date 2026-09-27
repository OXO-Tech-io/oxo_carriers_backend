import ExcelJS from 'exceljs';
import { FormModel } from './Form';
import { FormSectionModel, type FormSectionInput } from './FormSection';
import { FormQuestionModel, type FormQuestionInput } from './FormQuestion';
import { FormLogicRuleModel, type FormLogicRuleInput } from './FormLogicRule';
import { FormSettingsModel, type FormSettingsPatch } from './FormSettings';
import { FormThemeModel, type FormThemePatch } from './FormTheme';
import { FormDistributionModel } from './FormDistribution';
import { FormResponseModel } from './FormResponse';
import { AttachmentModel, type AttachmentFileInput } from '../../common/models/Attachment';
import { EmployeeModel } from '../../employees/Employee';
import { groupService } from '../groups/group.service';
import { notificationService } from '../notifications/notification.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/AppError';
import { formatExportTimestamp } from '../../utils/helpers';
import { isQuestionVisible } from './formLogic';
import type {
  Form as DrizzleForm,
  FormSettingsRow,
  FormResponseAnswer as DrizzleFormResponseAnswer,
  FormQuestion as DrizzleFormQuestion,
  Attachment as DrizzleAttachment,
} from '../../db/schema';
import type { CreateFormInput } from '../../validators/form.validator';

const AVERAGE_TYPES = new Set(['number', 'linear_scale', 'rating']);
const DISTRIBUTION_TYPES = new Set(['multiple_choice', 'checkboxes', 'dropdown', 'yes_no', 'multiple_choice_grid', 'checkbox_grid']);
const NON_ANSWERABLE_TYPES = new Set(['section_header', 'rich_text']);
const GRID_TYPES = new Set(['multiple_choice_grid', 'checkbox_grid']);

// 'closed' is never stored (see forms.ts schema comment) - derived here from
// a published form that's stopped accepting responses, either explicitly or
// because its deadline passed.
function deriveStatus(form: DrizzleForm, settings: FormSettingsRow | null): DrizzleForm['status'] {
  if (form.status === 'published' && settings) {
    const closedByAcceptance = settings.acceptResponses === false;
    const closedByDeadline = !!settings.closeAt && new Date() > new Date(settings.closeAt);
    if (closedByAcceptance || closedByDeadline) return 'closed' as DrizzleForm['status'];
  }
  return form.status;
}

// Grid answers (multiple_choice_grid/checkbox_grid) are `Record<rowValue, colValue | colValue[]>` -
// flattened here into "Row: Col, Col" text instead of raw JSON, so valueText (used by CSV/Excel
// export and as the display fallback) stays human-readable like every other answer type.
function formatGridValue(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([row, col]) => `${row}: ${Array.isArray(col) ? col.join(', ') : col}`)
    .join('; ');
}

function stringifyAnswerValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return formatGridValue(value as Record<string, unknown>);
  return String(value);
}

// Attaches uploaded-file metadata to each file_upload answer so callers (the recipient's own
// submitted-response view, and the admin Responses viewer) can render a name + link instead of the
// bare '-' the answer's null value/valueText would otherwise show.
async function withAttachments(
  answers: DrizzleFormResponseAnswer[],
  questions: DrizzleFormQuestion[],
): Promise<(DrizzleFormResponseAnswer & { attachments: DrizzleAttachment[] })[]> {
  const questionTypeById = new Map(questions.map((q) => [q.id, q.type]));
  const fileAnswers = answers.filter((a) => questionTypeById.get(a.questionId) === 'file_upload');
  if (!fileAnswers.length) return answers.map((a) => ({ ...a, attachments: [] }));
  const attachmentLists = await Promise.all(
    fileAnswers.map((a) => AttachmentModel.findByEntity('form_response_answer', a.id)),
  );
  const attachmentsByAnswerId = new Map(fileAnswers.map((a, i) => [a.id, attachmentLists[i] as DrizzleAttachment[]]));
  return answers.map((a) => ({ ...a, attachments: attachmentsByAnswerId.get(a.id) ?? [] }));
}

function isAnswerEmpty(value: unknown): boolean {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

async function assertFormExists(formId: number): Promise<void> {
  const form = await FormModel.findById(formId);
  if (!form) throw new NotFoundError('Form not found');
}

function toCsv(columns: { header: string; key: string }[], rows: Record<string, string>[]): Buffer {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [columns.map((c) => escape(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key] ?? '')).join(','));
  }
  return Buffer.from(lines.join('\n'), 'utf-8');
}

export const formService = {
  async create(input: CreateFormInput, createdBy: number) {
    const form = await FormModel.create({ title: input.title, description: input.description ?? null, createdBy });
    if (input.closeAt) {
      await FormSettingsModel.update(form.id, { closeAt: input.closeAt });
    }
    return form;
  },

  async update(formId: number, patch: { title?: string; description?: string | null }) {
    const form = await FormModel.update(formId, patch);
    if (!form) throw new NotFoundError('Form not found');
    return form;
  },

  async list() {
    const forms = await FormModel.listAll();
    const settingsList = await Promise.all(forms.map((f) => FormSettingsModel.findByFormId(f.id)));
    return forms.map((f, i) => ({
      ...f,
      status: deriveStatus(f, settingsList[i]),
      closeAt: settingsList[i]?.closeAt ?? null,
    }));
  },

  async getFormWithGraph(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const [sections, questions, logicRules, settings] = await Promise.all([
      FormSectionModel.listByFormId(formId),
      FormQuestionModel.listByFormId(formId),
      FormLogicRuleModel.listByFormId(formId),
      FormSettingsModel.findByFormId(formId),
    ]);
    return {
      form: { ...form, status: deriveStatus(form, settings), closeAt: settings?.closeAt ?? null },
      sections,
      questions,
      logicRules,
    };
  },

  async publish(formId: number) {
    const hasQuestion = await FormModel.hasAnyQuestion(formId);
    if (!hasQuestion) throw new BadRequestError('Add at least one question first');
    const form = await FormModel.publish(formId);
    if (!form) throw new NotFoundError('Form not found');
    return form;
  },

  async unpublish(formId: number) {
    const form = await FormModel.unpublish(formId);
    if (!form) throw new NotFoundError('Form not found');
    return form;
  },

  async archive(formId: number) {
    const form = await FormModel.archive(formId);
    if (!form) throw new NotFoundError('Form not found');
    return form;
  },

  async duplicate(formId: number, createdBy: number) {
    return FormModel.duplicate(formId, createdBy);
  },

  async delete(formId: number) {
    await assertFormExists(formId);
    const responses = await FormResponseModel.listByFormId(formId);
    for (const response of responses) {
      const answers = await FormResponseModel.listAnswersByResponseId(response.id);
      for (const answer of answers) {
        await AttachmentModel.deleteByEntity('form_response_answer', answer.id);
      }
    }
    await FormModel.deleteById(formId);
  },

  // Sections
  async createSection(formId: number, input: FormSectionInput) {
    await assertFormExists(formId);
    return FormSectionModel.create(formId, input);
  },
  async updateSection(id: number, patch: FormSectionInput) {
    const section = await FormSectionModel.update(id, patch);
    if (!section) throw new NotFoundError('Section not found');
    return section;
  },
  async deleteSection(id: number) {
    // Un-section its questions rather than deleting them (DB FK is set-null,
    // this just makes the intent explicit and works regardless of FK timing).
    await FormSectionModel.deleteById(id);
  },
  async reorderSections(sectionIds: number[]) {
    await FormSectionModel.reorder(sectionIds);
  },

  // Questions
  async createQuestion(formId: number, input: FormQuestionInput) {
    await assertFormExists(formId);
    return FormQuestionModel.create(formId, input);
  },
  async updateQuestion(id: number, patch: Partial<FormQuestionInput>) {
    const question = await FormQuestionModel.update(id, patch);
    if (!question) throw new NotFoundError('Question not found');
    return question;
  },
  async deleteQuestion(id: number) {
    await FormQuestionModel.deleteById(id);
  },
  async reorderQuestions(questionIds: number[]) {
    await FormQuestionModel.reorder(questionIds);
  },

  // Logic rules
  async createLogicRule(formId: number, input: FormLogicRuleInput) {
    await assertFormExists(formId);
    return FormLogicRuleModel.create(formId, input);
  },
  async updateLogicRule(id: number, patch: Partial<FormLogicRuleInput>) {
    const rule = await FormLogicRuleModel.update(id, patch);
    if (!rule) throw new NotFoundError('Logic rule not found');
    return rule;
  },
  async deleteLogicRule(id: number) {
    await FormLogicRuleModel.deleteById(id);
  },

  // Settings / theme
  async getSettings(formId: number) {
    const settings = await FormSettingsModel.findByFormId(formId);
    if (!settings) throw new NotFoundError('Form settings not found');
    return settings;
  },
  async updateSettings(formId: number, patch: FormSettingsPatch) {
    const settings = await FormSettingsModel.update(formId, patch);
    if (!settings) throw new NotFoundError('Form settings not found');
    return settings;
  },
  async getTheme(formId: number) {
    const theme = await FormThemeModel.findByFormId(formId);
    if (!theme) throw new NotFoundError('Form theme not found');
    return theme;
  },
  async updateTheme(formId: number, patch: FormThemePatch, file?: AttachmentFileInput) {
    const finalPatch = { ...patch };
    if (file) {
      finalPatch.headerImageUrl = `/uploads/others/${file.filename}`;
    }
    const theme = await FormThemeModel.update(formId, finalPatch);
    if (!theme) throw new NotFoundError('Form theme not found');
    return theme;
  },

  async distribute(formId: number, userIds: number[], groupIds: number[] = [], closeAt?: Date | null) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const groupMemberIds = await groupService.resolveMemberUserIds(groupIds);
    const resolvedUserIds = [...new Set([...userIds, ...groupMemberIds])];
    // createMany is idempotent - it returns only the newly-created rows (an
    // employee already distributed this form is skipped), so notifications
    // only go to people who are actually newly gaining access, not everyone
    // in the request every time HR re-distributes to an overlapping set.
    const distributions = await FormDistributionModel.createMany(formId, resolvedUserIds);
    if (closeAt !== undefined) {
      await FormSettingsModel.update(formId, { closeAt });
    }
    const newEmployeeIds = distributions.map((d) => d.employeeId);
    await notificationService.notifyMany(
      newEmployeeIds,
      'form',
      `New form: ${form.title}`,
      'HR has assigned you a form to fill out.',
      { formId },
      '/my-forms',
    );
    return distributions;
  },

  async listAssignedToMe(userId: number) {
    const distributions = await FormDistributionModel.listByUserId(userId);
    const results = await Promise.all(
      distributions.map(async (dist) => {
        const form = await FormModel.findById(dist.formId);
        if (!form) return null;
        const settings = await FormSettingsModel.findByFormId(dist.formId);
        const response = await FormResponseModel.findByFormAndUser(dist.formId, userId);
        return {
          // Raw status here, not the admin-facing derived 'closed' - a passed
          // deadline must not hide the form from the employee (they can still
          // submit late; only settings.acceptResponses===false hard-blocks).
          // The my-forms UI already computes its own "Overdue" badge from
          // closeAt below.
          form,
          distributedAt: dist.distributedAt,
          submitted: response?.status === 'submitted',
          acceptResponses: settings?.acceptResponses ?? true,
          closeAt: settings?.closeAt ?? null,
          allowEditAfterSubmit: settings?.allowEditAfterSubmit ?? false,
        };
      }),
    );
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  },

  async isDistributedTo(formId: number, userId: number) {
    return FormDistributionModel.isDistributedTo(formId, userId);
  },

  async listDistributedUserIds(formId: number): Promise<number[]> {
    const distributions = await FormDistributionModel.listByFormId(formId);
    const employeeMap = await EmployeeModel.findByEmployeeIds(distributions.map((d) => d.employeeId));
    return [...employeeMap.values()].map((e) => e.id);
  },

  async getMyResponse(formId: number, userId: number) {
    const response = await FormResponseModel.findByFormAndUser(formId, userId);
    const settings = await FormSettingsModel.findByFormId(formId);
    const rawAnswers = response ? await FormResponseModel.listAnswersByResponseId(response.id) : [];
    const questions = rawAnswers.length ? await FormQuestionModel.listByFormId(formId) : [];
    const answers = await withAttachments(rawAnswers, questions);
    return { response, answers, allowEditAfterSubmit: settings?.allowEditAfterSubmit ?? false };
  },

  async submitResponse(
    formId: number,
    userId: number,
    answersInput: { questionId: number; value?: unknown }[],
    files: AttachmentFileInput[],
    final: boolean,
  ) {
    const isDistributed = await FormDistributionModel.isDistributedTo(formId, userId);
    if (!isDistributed) throw new ForbiddenError('This form was not assigned to you');

    const settings = await FormSettingsModel.findByFormId(formId);
    // acceptResponses===false is HR explicitly turning submissions off - that
    // still hard-blocks. A passed closeAt does NOT block submission - it's
    // just a deadline (matches how Communications treats acknowledgement
    // deadlines: still acknowledgeable after the deadline, just flagged late).
    if (settings?.acceptResponses === false) {
      throw new BadRequestError('This form is no longer accepting responses');
    }

    const existing = await FormResponseModel.findByFormAndUser(formId, userId);
    if (existing?.status === 'submitted' && !settings?.allowEditAfterSubmit) {
      throw new BadRequestError('You have already submitted a response for this form');
    }

    const questions = await FormQuestionModel.listByFormId(formId);
    const questionById = new Map(questions.map((q) => [q.id, q]));

    const valuesByQuestion: Record<number, unknown> = {};
    for (const a of answersInput) valuesByQuestion[a.questionId] = a.value;
    const fileQuestionIds = new Set(
      files.map((f) => Number(f.fieldname.replace('question_', ''))).filter((id) => !Number.isNaN(id)),
    );
    for (const id of fileQuestionIds) {
      if (!(id in valuesByQuestion)) valuesByQuestion[id] = true; // presence marker for visibility comparators
    }

    const logicRules = await FormLogicRuleModel.listByFormId(formId);

    // Existing answers/attachments must be inspected BEFORE they're wiped by replaceAnswers below,
    // both to let a file question with no new upload in this submission (allowEditAfterSubmit,
    // re-saving a response without re-selecting the file) count as "already answered" for
    // required-ness, and so its attachment can be carried over onto the new answer row afterwards.
    // `existing` was already fetched above for the allowEditAfterSubmit check.
    const oldAnswersForCarry = existing ? await FormResponseModel.listAnswersByResponseId(existing.id) : [];
    const carriedAttachmentsByQuestion = new Map<number, DrizzleAttachment[]>();
    for (const old of oldAnswersForCarry) {
      if (fileQuestionIds.has(old.questionId)) continue; // being replaced by a new upload below
      if (questionById.get(old.questionId)?.type !== 'file_upload') continue;
      const existingFiles = await AttachmentModel.findByEntity('form_response_answer', old.id);
      if (existingFiles.length) carriedAttachmentsByQuestion.set(old.questionId, existingFiles);
    }
    for (const id of carriedAttachmentsByQuestion.keys()) {
      if (!(id in valuesByQuestion)) valuesByQuestion[id] = true; // presence marker, same as fileQuestionIds
    }

    if (final) {
      for (const q of questions) {
        if (NON_ANSWERABLE_TYPES.has(q.type)) continue;
        const value = valuesByQuestion[q.id];
        const empty =
          q.type === 'file_upload'
            ? !(fileQuestionIds.has(q.id) || carriedAttachmentsByQuestion.has(q.id))
            : isAnswerEmpty(value);
        // Required-ness only applies while the question is visible - a hidden question can't force
        // the user to answer it. But a *submitted* value must still be validated against its type's
        // constraints even when hidden, since a value can be stale (belonging to a since-hidden
        // question) or tampered; silently accepting it would persist invalid/out-of-range data.
        const visible = isQuestionVisible(q.id, logicRules, valuesByQuestion);
        if (q.required && visible && empty) throw new BadRequestError(`"${q.title || 'Untitled question'}" is required`);
        if (empty) continue;

        const config = (q.config ?? {}) as Record<string, unknown>;
        if (q.type === 'multiple_choice' || q.type === 'dropdown') {
          const allowOther = !!(config as { allowOther?: boolean }).allowOther;
          const allowedValues = new Set(q.options.map((o) => o.value));
          if (!allowedValues.has(String(value)) && !allowOther) {
            throw new BadRequestError(`Invalid value for "${q.title}"`);
          }
        } else if (q.type === 'number') {
          const num = Number(value);
          if (Number.isNaN(num)) throw new BadRequestError(`"${q.title}" must be a number`);
          const min = typeof config.min === 'number' ? config.min : undefined;
          const max = typeof config.max === 'number' ? config.max : undefined;
          if ((min !== undefined && num < min) || (max !== undefined && num > max)) {
            throw new BadRequestError(`"${q.title}" must be between ${min ?? '-∞'} and ${max ?? '∞'}`);
          }
        } else if (q.type === 'short_answer' || q.type === 'paragraph') {
          const maxLength = typeof config.maxLength === 'number' && config.maxLength > 0 ? config.maxLength : undefined;
          if (maxLength && String(value).length > maxLength) {
            throw new BadRequestError(`"${q.title}" exceeds the maximum length of ${maxLength} characters`);
          }
        } else if (q.type === 'checkboxes') {
          const selections = Array.isArray(value) ? value : [];
          const minSelections =
            typeof config.minSelections === 'number' && config.minSelections > 0 ? config.minSelections : undefined;
          const maxSelections =
            typeof config.maxSelections === 'number' && config.maxSelections > 0 ? config.maxSelections : undefined;
          if (minSelections && selections.length < minSelections) {
            throw new BadRequestError(`"${q.title}" requires at least ${minSelections} selection(s)`);
          }
          if (maxSelections && selections.length > maxSelections) {
            throw new BadRequestError(`"${q.title}" allows at most ${maxSelections} selection(s)`);
          }
        }
      }
    }

    const filesByQuestion = new Map<number, AttachmentFileInput[]>();
    for (const file of files) {
      const questionId = Number(file.fieldname.replace('question_', ''));
      const list = filesByQuestion.get(questionId) ?? [];
      list.push(file);
      filesByQuestion.set(questionId, list);
    }
    for (const [questionId, questionFiles] of filesByQuestion) {
      const question = questionById.get(questionId);
      if (!question || question.type !== 'file_upload') continue;
      const config = (question.config ?? {}) as { maxFiles?: number };
      if (typeof config.maxFiles === 'number' && questionFiles.length > config.maxFiles) {
        throw new BadRequestError(`"${question.title}" allows at most ${config.maxFiles} file(s)`);
      }
    }

    const response = await FormResponseModel.findOrCreate(formId, userId);

    const oldAnswers = await FormResponseModel.listAnswersByResponseId(response.id);
    for (const old of oldAnswers) {
      await AttachmentModel.deleteByEntity('form_response_answer', old.id);
    }

    const answersToSave = answersInput
      .filter((a) => questionById.get(a.questionId)?.type !== 'file_upload')
      .map((a) => ({ questionId: a.questionId, value: a.value ?? null, valueText: stringifyAnswerValue(a.value) }));
    for (const questionId of fileQuestionIds) {
      answersToSave.push({ questionId, value: null, valueText: null });
    }
    for (const questionId of carriedAttachmentsByQuestion.keys()) {
      if (fileQuestionIds.has(questionId)) continue;
      answersToSave.push({ questionId, value: null, valueText: null });
    }

    const savedAnswers = await FormResponseModel.replaceAnswers(response.id, answersToSave);

    for (const file of files) {
      const questionId = Number(file.fieldname.replace('question_', ''));
      const question = questionById.get(questionId);
      if (!question || question.type !== 'file_upload') continue;
      const config = (question.config ?? {}) as { allowedMimeTypes?: string[]; maxSizeMb?: number };
      if (config.maxSizeMb && file.size > config.maxSizeMb * 1024 * 1024) {
        throw new BadRequestError(`File for "${question.title}" exceeds the ${config.maxSizeMb}MB limit`);
      }
      if (config.allowedMimeTypes?.length) {
        const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
        const allowedExts = config.allowedMimeTypes.map((s) => s.trim().toLowerCase().replace(/^\./, ''));
        if (!allowedExts.includes(ext)) {
          throw new BadRequestError(`File type ".${ext}" not allowed for "${question.title}" (expected: ${allowedExts.join(', ')})`);
        }
      }
      const answer = savedAnswers.find((a) => a.questionId === questionId);
      if (answer) await AttachmentModel.create('form_response_answer', answer.id, file, userId);
    }

    for (const [questionId, existingFiles] of carriedAttachmentsByQuestion) {
      const answer = savedAnswers.find((a) => a.questionId === questionId);
      if (!answer) continue;
      for (const att of existingFiles) {
        await AttachmentModel.copyToEntity('form_response_answer', answer.id, att);
      }
    }

    if (final) {
      const startedAt = existing?.startedAt ?? response.startedAt;
      const completionMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
      await FormResponseModel.markSubmitted(response.id, completionMs);
      // The DB row is now submitted, but `response` above was fetched before
      // that update - reflect it in the object we return to the caller.
      response.status = 'submitted';
      response.submittedAt = new Date();
      response.completionMs = completionMs;
      const isFirstSubmission = !existing || existing.status !== 'submitted';
      if (isFirstSubmission) {
        await FormModel.recordResponse(formId);
      }

      const employee = await EmployeeModel.findById(userId);
      const form = await FormModel.findById(formId);
      if (employee?.employeeId && form) {
        if (settings?.notifyRespondent) {
          await notificationService.notify(
            employee.employeeId,
            'form',
            'Response submitted',
            `Your response to "${form.title}" was submitted successfully.`,
            { formId },
            '/my-forms',
          );
        }
        if (settings?.notifyOwnerOnResponse && form.createdBy && form.createdBy !== userId) {
          const owner = await EmployeeModel.findById(form.createdBy);
          if (owner?.employeeId) {
            await notificationService.notify(
              owner.employeeId,
              'form',
              `New response: ${form.title}`,
              `${employee.firstName} ${employee.lastName} submitted a response.`,
              { formId },
              `/admin/forms/${formId}/responses`,
            );
          }
        }
      }
    }

    return { response, answers: savedAnswers };
  },

  async listResponses(formId: number) {
    const [responses, questions] = await Promise.all([
      FormResponseModel.listByFormId(formId),
      FormQuestionModel.listByFormId(formId),
    ]);
    return Promise.all(
      responses.map(async (response) => {
        const rawAnswers = await FormResponseModel.listAnswersByResponseId(response.id);
        const answers = await withAttachments(rawAnswers, questions);
        const user = response.employeeId ? await EmployeeModel.findByEmployeeId(response.employeeId) : null;
        return { response, answers, user };
      }),
    );
  },

  async getAnalytics(formId: number) {
    const { questions } = await this.getFormWithGraph(formId);
    const answerableQuestions = questions.filter((q) => !NON_ANSWERABLE_TYPES.has(q.type));
    const allResponses = await FormResponseModel.listByFormId(formId);
    const submitted = allResponses.filter((r) => r.status === 'submitted');

    const totalStarted = allResponses.length;
    const totalResponses = submitted.length;
    const completionRate = totalStarted ? totalResponses / totalStarted : 0;
    const avgCompletionMs = submitted.length
      ? submitted.reduce((sum, r) => sum + (r.completionMs ?? 0), 0) / submitted.length
      : 0;

    const trendMap = new Map<string, number>();
    for (const r of submitted) {
      if (!r.submittedAt) continue;
      const date = new Date(r.submittedAt).toISOString().slice(0, 10);
      trendMap.set(date, (trendMap.get(date) ?? 0) + 1);
    }
    const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

    const answersByResponse = await Promise.all(submitted.map((r) => FormResponseModel.listAnswersByResponseId(r.id)));
    const answersByQuestion = new Map<number, DrizzleFormResponseAnswer[]>();
    for (const answer of answersByResponse.flat()) {
      const list = answersByQuestion.get(answer.questionId) ?? [];
      list.push(answer);
      answersByQuestion.set(answer.questionId, list);
    }

    const perQuestion = answerableQuestions.map((q) => {
      const answers = answersByQuestion.get(q.id) ?? [];
      const responseCount = answers.length;
      let distribution: { label: string; count: number }[] | undefined;
      let average: number | undefined;

      if (AVERAGE_TYPES.has(q.type)) {
        const nums = answers.map((a) => Number(a.value)).filter((n) => !Number.isNaN(n));
        average = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      } else if (DISTRIBUTION_TYPES.has(q.type)) {
        const counts = new Map<string, number>();
        for (const a of answers) {
          const value = a.value;
          const values: unknown[] = Array.isArray(value)
            ? value
            : value && typeof value === 'object'
              ? Object.values(value as Record<string, unknown>).flat()
              : [value];
          for (const v of values) {
            const key = String(v);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        distribution = [...counts.entries()].map(([label, count]) => ({ label, count }));
      }

      return { questionId: q.id, title: q.title, type: q.type, responseCount, distribution, average };
    });

    return { totalResponses, totalStarted, completionRate, avgCompletionMs, trend, perQuestion };
  },

  async exportResponses(formId: number, format: 'xlsx' | 'csv' = 'xlsx'): Promise<Buffer> {
    const { form, questions } = await this.getFormWithGraph(formId);
    const answerableQuestions = questions.filter((q) => !NON_ANSWERABLE_TYPES.has(q.type));
    const responses = await this.listResponses(formId);
    // Mirrors FormResponsesClient.tsx's `isLate` so the exported Status column agrees with what
    // the Responses page shows on screen instead of collapsing both into a bare "submitted".
    const closeAt = form.closeAt ? new Date(form.closeAt) : null;

    const columns = [
      { header: 'Submitted By', key: 'submittedBy' },
      { header: 'Email', key: 'email' },
      { header: 'Status', key: 'status' },
      { header: 'Submitted At', key: 'submittedAt' },
      ...answerableQuestions.map((q) => ({ header: q.title || 'Untitled', key: `q_${q.id}` })),
    ];

    const rows = responses.map(({ response, answers, user }) => {
      const isLate = response.status === 'submitted' && !!closeAt && !!response.submittedAt && new Date(response.submittedAt) > closeAt;
      const row: Record<string, string> = {
        submittedBy: user ? `${user.firstName} ${user.lastName}` : `Employee ${response.employeeId}`,
        email: user?.email ?? '',
        status: response.status === 'submitted' ? (isLate ? 'Submitted (Late)' : 'Submitted') : 'In progress',
        submittedAt: formatExportTimestamp(response.submittedAt),
      };
      for (const q of answerableQuestions) {
        const answer = answers.find((a) => a.questionId === q.id);
        row[`q_${q.id}`] =
          q.type === 'file_upload' ? (answer?.attachments ?? []).map((a) => a.fileName).join(', ') : answer?.valueText ?? '';
      }
      return row;
    });

    if (format === 'csv') return toCsv(columns, rows);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet((form.title || 'Responses').slice(0, 31));
    worksheet.columns = columns.map((c) => ({ ...c, width: 30 }));
    worksheet.getRow(1).font = { bold: true };
    rows.forEach((row) => worksheet.addRow(row));
    return workbook.xlsx.writeBuffer() as unknown as Buffer;
  },
};
