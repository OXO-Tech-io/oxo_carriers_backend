import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const renameGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
});
export type RenameGroupInput = z.infer<typeof renameGroupSchema>;

export const addGroupMembersSchema = z.object({
  userIds: z.array(z.coerce.number().int().positive()).min(1, 'At least one member is required'),
});
export type AddGroupMembersInput = z.infer<typeof addGroupMembersSchema>;

export const groupIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type GroupIdParam = z.infer<typeof groupIdParamSchema>;

export const groupMemberParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});
export type GroupMemberParam = z.infer<typeof groupMemberParamSchema>;
