import { Request, Response } from 'express';
import { employeeNoteService } from '../services/employeeNote.service';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import { UserRole } from '../types';
import { CreateEmployeeNoteInput, UpdateEmployeeNoteInput, EmployeeNoteIdParam, EmployeeUserIdParam } from '../validators/employeeNote.validator';

const NOTE_CREATOR_ROLES: UserRole[] = [UserRole.HR_EXECUTIVE, UserRole.HR_MANAGER, UserRole.SUPER_ADMIN];

export const create = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  if (!NOTE_CREATOR_ROLES.includes(req.user.role)) {
    throw new ForbiddenError('Only HR Team or HR Manager can add employee notes');
  }
  const { employeeUserId, content } = req.body as CreateEmployeeNoteInput;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const note = await employeeNoteService.create(employeeUserId, req.user.userId, content, files);
  created(res, note, 'Note added');
};

export const listForEmployee = async (req: Request, res: Response) => {
  const { employeeUserId } = req.params as unknown as EmployeeUserIdParam;
  const notes = await employeeNoteService.listForEmployee(employeeUserId);
  ok(res, notes, 'Notes fetched');
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as EmployeeNoteIdParam;
  const note = await employeeNoteService.getById(id);
  if (!note) throw new NotFoundError('Note not found');
  ok(res, note, 'Note fetched');
};

export const update = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as EmployeeNoteIdParam;
  const { content } = req.body as UpdateEmployeeNoteInput;
  const note = await employeeNoteService.update(id, content);
  if (!note) throw new NotFoundError('Note not found');
  ok(res, note, 'Note updated');
};
