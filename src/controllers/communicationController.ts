import { Request, Response } from 'express';
import { communicationService } from '../services/communication.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import { CreateCommunicationInput, RespondCommunicationInput, CommunicationIdParam } from '../validators/communication.validator';

export const create = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { title, body, recipientUserIds } = req.body as CreateCommunicationInput;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const communication = await communicationService.create(title, body, recipientUserIds, req.user.userId, files);
  created(res, communication, 'Communication sent');
};

export const listAll = async (_req: Request, res: Response) => {
  const communications = await communicationService.listAll();
  ok(res, communications, 'Communications fetched');
};

export const listMine = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const communications = await communicationService.listMine(req.user.userId);
  ok(res, communications, 'Communications fetched');
};

export const respond = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = req.params as unknown as CommunicationIdParam;
  const { responseText } = req.body as RespondCommunicationInput;
  await communicationService.respond(id, req.user.userId, responseText);
  ok(res, {}, 'Response recorded');
};

export const report = async (req: Request, res: Response) => {
  const { id } = req.query as { id?: string };
  const buffer = await communicationService.generateReport(id ? Number(id) : undefined);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=communications-report.xlsx');
  res.send(buffer);
};
