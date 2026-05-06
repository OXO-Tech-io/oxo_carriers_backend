import { z } from 'zod';
import { LeaveStatus } from '../types';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const stringBool = z
  .union([z.boolean(), z.string()])
  .transform(v => v === true || v === 'true');

export const createLeaveRequestSchema = z
  .object({
    leave_type_id: z.coerce.number().int().positive(),
    start_date: isoDate,
    end_date: isoDate,
    reason: z.string().min(1, 'Reason is required').max(2000).optional(),
    is_half_day: stringBool.optional().default(false),
    half_day_period: z.enum(['morning', 'evening']).optional(),
  })
  .refine(
    data => !data.is_half_day || data.start_date === data.end_date,
    {
      message: 'Half-day leave requires start_date and end_date to be the same',
      path: ['end_date'],
    }
  )
  .refine(data => !data.is_half_day || !!data.half_day_period, {
    message: 'half_day_period is required when is_half_day is true',
    path: ['half_day_period'],
  });

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const approveLeaveRequestSchema = z.object({
  approvedBy: z.enum(['team_leader', 'hr']),
  rejectionReason: z.string().optional(),
});
export type ApproveLeaveRequestInput = z.infer<typeof approveLeaveRequestSchema>;

export const rejectLeaveRequestSchema = z.object({
  rejectionReason: z.string().min(1, 'Rejection reason is required'),
});
export type RejectLeaveRequestInput = z.infer<typeof rejectLeaveRequestSchema>;

export const listLeaveRequestsQuerySchema = z.object({
  status: z.nativeEnum(LeaveStatus).optional(),
  department: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>;

export const leaveBalanceQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type LeaveBalanceQuery = z.infer<typeof leaveBalanceQuerySchema>;

export const leaveIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type LeaveIdParam = z.infer<typeof leaveIdParamSchema>;
