import { Request, Response } from 'express';
import { eventService } from '../services/event.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import { CreateEventInput, RecordParticipationInput, EventIdParam } from '../validators/event.validator';

export const create = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const event = await eventService.create(req.body as CreateEventInput, req.employee.userId);
  created(res, event, 'Event created');
};

export const list = async (_req: Request, res: Response) => {
  const events = await eventService.list();
  ok(res, events, 'Events fetched');
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as EventIdParam;
  const data = await eventService.getWithParticipants(id);
  ok(res, data, 'Event fetched');
};

export const recordParticipation = async (req: Request, res: Response) => {
  if (!req.employee) throw new UnauthorizedError();
  const { id } = req.params as unknown as EventIdParam;
  const { participants } = req.body as RecordParticipationInput;
  const result = await eventService.recordParticipation(id, participants, req.employee.userId);
  ok(res, result, 'Participation recorded');
};
