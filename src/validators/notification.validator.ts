import { z } from 'zod';

const stringBool = z
  .union([z.boolean(), z.string()])
  .transform(v => v === true || v === 'true');

export const listNotificationsQuerySchema = z.object({
  isRead: stringBool.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
