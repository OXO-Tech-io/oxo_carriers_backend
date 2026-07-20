import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const workLogEntrySchema = z.object({
  workDate: isoDate,
  taskDescription: z.string().min(1, 'Task description is required').max(1000),
  hoursSpent: z.coerce.number().positive().max(24),
  remarks: z.string().max(1000).optional(),
});
export type WorkLogEntryInput = z.infer<typeof workLogEntrySchema>;

export const submitWorkLogsSchema = z.object({
  entries: z.array(workLogEntrySchema).min(1, 'At least one entry is required'),
});
export type SubmitWorkLogsInput = z.infer<typeof submitWorkLogsSchema>;

export const listWorkLogsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  userId: z.coerce.number().int().positive().optional(),
});
export type ListWorkLogsQuery = z.infer<typeof listWorkLogsQuerySchema>;
