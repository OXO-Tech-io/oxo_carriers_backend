import { z } from 'zod';

export const createCommunicationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  body: z.string().min(1, 'Body is required'),
  recipientUserIds: z
    .union([z.array(z.coerce.number().int().positive()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : JSON.parse(v)))
    .pipe(z.array(z.coerce.number().int().positive()).min(1, 'At least one recipient is required')),
});
export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;

export const respondCommunicationSchema = z.object({
  responseText: z.string().max(2000).optional(),
});
export type RespondCommunicationInput = z.infer<typeof respondCommunicationSchema>;

export const communicationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type CommunicationIdParam = z.infer<typeof communicationIdParamSchema>;
