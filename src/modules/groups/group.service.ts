import { GroupModel } from './Group';
import { EmployeeModel } from '../../employees/Employee';
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

  // OCD-520: the "Add Members" picker must never offer someone who's already
  // in the group - excluded here server-side (rather than left to the
  // frontend to diff against the current roster) so a stale/cached member
  // list on the client can't cause a duplicate-looking entry to appear. A
  // re-add of an already-present member is harmless either way
  // (GroupModel.addMembers already `onConflictDoNothing`s), but this is what
  // keeps the picker's list itself correct.
  async availableMembers(groupId: number, search?: string) {
    const group = await GroupModel.findById(groupId);
    if (!group) throw new NotFoundError('Group not found');

    const [memberUserIds, employees] = await Promise.all([
      GroupModel.getMemberUserIds([groupId]),
      EmployeeModel.getAll({ search }),
    ]);
    const memberUserIdSet = new Set(memberUserIds);
    return employees.filter((employee) => !memberUserIdSet.has(employee.id));
  },
};
