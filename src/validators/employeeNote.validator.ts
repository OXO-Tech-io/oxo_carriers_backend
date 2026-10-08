import { z } from 'zod';

export const createEmployeeNoteSchema = z.object({
  employeeUserId: z.coerce.number().int().positive(),
  content: z.string().min(1, 'Content is required').max(5000),
});
export type CreateEmployeeNoteInput = z.infer<typeof createEmployeeNoteSchema>;

export const updateEmployeeNoteSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000),
});
export type UpdateEmployeeNoteInput = z.infer<typeof updateEmployeeNoteSchema>;

export const employeeNoteIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type EmployeeNoteIdParam = z.infer<typeof employeeNoteIdParamSchema>;

export const employeeUserIdParamSchema = z.object({
  employeeUserId: z.coerce.number().int().positive(),
});
export type EmployeeUserIdParam = z.infer<typeof employeeUserIdParamSchema>;
