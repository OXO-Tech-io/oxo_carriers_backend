import { GroupModel } from './Group';
import { ConflictError, NotFoundError } from '../../utils/AppError';

export const groupService = {
  async list() {
    return GroupModel.listAll();
  },

  async getById(id: number) {
    const group = await GroupModel.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    const members = await GroupModel.listMembers(id);
    return { group, members };
  },

  async create(name: string, createdBy: number) {
    const existing = await GroupModel.findByName(name);
    if (existing) throw new ConflictError('A group with this name already exists');
    return GroupModel.create(name, createdBy);
  },

  async rename(id: number, name: string) {
    const existing = await GroupModel.findByName(name);
    if (existing && existing.id !== id) throw new ConflictError('A group with this name already exists');
    const group = await GroupModel.rename(id, name);
    if (!group) throw new NotFoundError('Group not found');
    return group;
  },

  async remove(id: number) {
    const group = await GroupModel.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    await GroupModel.delete(id);
  },

  async addMembers(id: number, userIds: number[], addedBy: number) {
    const group = await GroupModel.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    return GroupModel.addMembers(id, userIds, addedBy);
  },

  async removeMember(id: number, userId: number) {
    const group = await GroupModel.findById(id);
    if (!group) throw new NotFoundError('Group not found');
    await GroupModel.removeMember(id, userId);
  },

  /** Resolves group IDs to a flat, deduped user-ID list for Communications/Forms recipient targeting. */
  async resolveMemberUserIds(groupIds: number[]) {
    return GroupModel.getMemberUserIds(groupIds);
  },
};
