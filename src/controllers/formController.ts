import { Request, Response } from 'express';
import { formService } from '../services/form.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import { CreateFormInput, DistributeFormInput, SubmitFormResponseInput, FormIdParam } from '../validators/form.validator';

export const create = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const result = await formService.create(req.body as CreateFormInput, req.employee.userId);
  created(res, result, 'Form created');
};

export const list = async (_req: Request, res: Response) => {
  const forms = await formService.list();
  ok(res, forms, 'Forms fetched');
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const data = await formService.getFormWithFields(id);
  ok(res, data, 'Form fetched');
};

export const publish = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const form = await formService.publish(id);
  ok(res, form, 'Form published');
};

export const distribute = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const { userIds, groupIds } = req.body as DistributeFormInput;
  const result = await formService.distribute(id, userIds, groupIds);
  ok(res, result, 'Form distributed');
};

export const listAssignedToMe = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const result = await formService.listAssignedToMe(req.employee.userId);
  ok(res, result, 'Assigned forms fetched');
};

export const submitResponse = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const { id } = req.params as unknown as FormIdParam;
  const { answers } = req.body as SubmitFormResponseInput;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const response = await formService.submitResponse(id, req.employee.userId, answers, files);
  created(res, response, 'Response submitted');
};

export const listResponses = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const responses = await formService.listResponses(id);
  ok(res, responses, 'Responses fetched');
};

export const exportResponses = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as FormIdParam;
  const buffer = await formService.exportResponsesToExcel(id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=form-${id}-responses.xlsx`);
  res.send(buffer);
};
