import { Request, Response } from 'express';
import { groupService } from '../services/group.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import {
  AddGroupMembersInput,
  CreateGroupInput,
  GroupIdParam,
  GroupMemberParam,
  RenameGroupInput,
} from '../validators/group.validator';

export const list = async (_req: Request, res: Response) => {
  const groups = await groupService.list();
  ok(res, groups, 'Groups fetched');
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as GroupIdParam;
  const data = await groupService.getById(id);
  ok(res, data, 'Group fetched');
};

export const create = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { name } = req.body as CreateGroupInput;
  const group = await groupService.create(name, req.user.userId);
  created(res, group, 'Group created');
};

export const rename = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as GroupIdParam;
  const { name } = req.body as RenameGroupInput;
  const group = await groupService.rename(id, name);
  ok(res, group, 'Group renamed');
};

export const remove = async (req: Request, res: Response) => {
  const { id } = req.params as unknown as GroupIdParam;
  await groupService.remove(id);
  ok(res, {}, 'Group deleted');
};

export const addMembers = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = req.params as unknown as GroupIdParam;
  const { userIds } = req.body as AddGroupMembersInput;
  const members = await groupService.addMembers(id, userIds, req.user.userId);
  created(res, members, 'Members added');
};

export const removeMember = async (req: Request, res: Response) => {
  const { id, userId } = req.params as unknown as GroupMemberParam;
  await groupService.removeMember(id, userId);
  ok(res, {}, 'Member removed');
};
