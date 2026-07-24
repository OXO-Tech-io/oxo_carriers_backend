import { z } from 'zod';

// Accepts either a real array (JSON body) or a JSON-encoded string (multipart
// form-data, required for file attachments) - same shape for both
// recipientUserIds and recipientGroupIds.
const idArrayField = z
  .union([z.array(z.coerce.number().int().positive()), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return [];
    return Array.isArray(v) ? v : JSON.parse(v);
  })
  .pipe(z.array(z.coerce.number().int().positive()));

export const createCommunicationSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(255),
    body: z.string().min(1, 'Body is required'),
    requiresAcknowledgement: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => (typeof v === 'string' ? v === 'true' : !!v)),
    deadlineAt: z.string().nullable().optional(),
    recipientUserIds: idArrayField,
    recipientGroupIds: idArrayField,
  })
  .refine((data) => data.recipientUserIds.length > 0 || data.recipientGroupIds.length > 0, {
    message: 'At least one recipient or group is required',
    path: ['recipientUserIds'],
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
