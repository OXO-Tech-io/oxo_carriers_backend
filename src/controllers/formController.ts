import { Request, Response } from 'express';
import { formService } from '../services/form.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import {
  CreateFormInput,
  UpdateFormInput,
  DistributeFormInput,
  SubmitFormResponseInput,
  FormIdParam,
  IdParam,
  CreateSectionInput,
  UpdateSectionInput,
  ReorderSectionsInput,
  CreateQuestionInput,
  UpdateQuestionInput,
  ReorderQuestionsInput,
  CreateLogicRuleInput,
  UpdateLogicRuleInput,
  UpdateFormSettingsInput,
  UpdateFormThemeInput,
  ExportResponsesQuery,
} from '../validators/form.validator';

export const create = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await formService.create(req.body as CreateFormInput, req.user.userId);
  created(res, result, 'Form created');
};

export const list = async (_req: Request, res: Response) => {
  const forms = await formService.list();
  ok(res, forms, 'Forms fetched');
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const data = await formService.getFormGraph(id);
  ok(res, data, 'Form fetched');
};

export const update = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const form = await formService.update(id, req.body as UpdateFormInput);
  ok(res, form, 'Form updated');
};

export const remove = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  await formService.remove(id);
  ok(res, null, 'Form deleted');
};

export const duplicate = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.duplicate(id, req.user.userId);
  created(res, result, 'Form duplicated');
};

export const publish = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const form = await formService.publish(id);
  ok(res, form, 'Form published');
};

export const unpublish = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const form = await formService.unpublish(id);
  ok(res, form, 'Form unpublished');
};

export const archive = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const form = await formService.archive(id);
  ok(res, form, 'Form archived');
};

export const distribute = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const { userIds, groupIds } = req.body as DistributeFormInput;
  const result = await formService.distribute(id, userIds, groupIds);
  ok(res, result, 'Form distributed');
};

export const listAssignedToMe = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await formService.listAssignedToMe(req.user.userId);
  ok(res, result, 'Assigned forms fetched');
};

export const getMyResponse = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.getMyResponse(id, req.user.userId);
  ok(res, result, 'Your response fetched');
};

export const submitResponse = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = req.params as unknown as FormIdParam;
  const { answers, final } = req.body as SubmitFormResponseInput;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const response = await formService.submitResponse(id, req.user.userId, answers, files, final);
  created(res, response, 'Response submitted');
};

export const listResponses = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const responses = await formService.listResponses(id);
  ok(res, responses, 'Responses fetched');
};

export const exportResponses = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const { format } = req.query as unknown as ExportResponsesQuery;
  if (format === 'csv') {
    const csv = await formService.exportResponsesToCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.csv`);
    res.send(csv);
    return;
  }
  const buffer = await formService.exportResponsesToExcel(id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.xlsx`);
  res.send(buffer);
};

export const getAnalytics = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.getAnalytics(id);
  ok(res, result, 'Form analytics fetched');
};

// ── Sections ────────────────────────────────────────────────────────────────

export const createSection = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.createSection(id, req.body as CreateSectionInput);
  created(res, result, 'Section created');
};

export const updateSection = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as IdParam;
  const result = await formService.updateSection(id, req.body as UpdateSectionInput);
  ok(res, result, 'Section updated');
};

export const deleteSection = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as IdParam;
  await formService.deleteSection(id);
  ok(res, null, 'Section deleted');
};

export const reorderSections = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const { sectionIds } = req.body as ReorderSectionsInput;
  await formService.reorderSections(id, sectionIds);
  ok(res, null, 'Sections reordered');
};

// ── Questions ────────────────────────────────────────────────────────────────

export const createQuestion = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.createQuestion(id, req.body as CreateQuestionInput);
  created(res, result, 'Question created');
};

export const updateQuestion = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as IdParam;
  const result = await formService.updateQuestion(id, req.body as UpdateQuestionInput);
  ok(res, result, 'Question updated');
};

export const deleteQuestion = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as IdParam;
  await formService.deleteQuestion(id);
  ok(res, null, 'Question deleted');
};

export const reorderQuestions = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const { questionIds, sectionId } = req.body as ReorderQuestionsInput;
  await formService.reorderQuestions(id, questionIds, sectionId);
  ok(res, null, 'Questions reordered');
};

// ── Logic rules ──────────────────────────────────────────────────────────────

export const createLogicRule = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.createLogicRule(id, req.body as CreateLogicRuleInput);
  created(res, result, 'Logic rule created');
};

export const updateLogicRule = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as IdParam;
  const result = await formService.updateLogicRule(id, req.body as UpdateLogicRuleInput);
  ok(res, result, 'Logic rule updated');
};

export const deleteLogicRule = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as IdParam;
  await formService.deleteLogicRule(id);
  ok(res, null, 'Logic rule deleted');
};

// ── Settings & theme ─────────────────────────────────────────────────────────

export const getSettings = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.getSettings(id);
  ok(res, result, 'Form settings fetched');
};

export const updateSettings = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.updateSettings(id, req.body as UpdateFormSettingsInput);
  ok(res, result, 'Form settings updated');
};

export const getTheme = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.getTheme(id);
  ok(res, result, 'Form theme fetched');
};

export const updateTheme = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const result = await formService.updateTheme(id, req.body as UpdateFormThemeInput);
  ok(res, result, 'Form theme updated');
};
