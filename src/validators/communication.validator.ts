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

// Multipart form-data (required whenever attachments are included) encodes
// booleans/dates as plain strings, so this accepts either the native JSON
// type or its string form - same reasoning as idArrayField above.
const booleanField = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true');

const nullableDateField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

export const createCommunicationSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(255),
    body: z.string().min(1, 'Body is required'),
    recipientUserIds: idArrayField,
    recipientGroupIds: idArrayField,
    requiresAcknowledgement: booleanField,
    deadlineAt: nullableDateField,
  })
  .refine((data) => data.recipientUserIds.length > 0 || data.recipientGroupIds.length > 0, {
    message: 'At least one recipient or group is required',
    path: ['recipientUserIds'],
  })
  // OCD-515: an acknowledgement deadline only makes sense if it hasn't already
  // passed. Compared date-only (both truncated to local midnight) so a
  // deadline of "today" is always accepted regardless of what time of day the
  // request happens to be submitted - only a date strictly before today is
  // rejected.
  .refine(
    (data) => {
      if (!data.requiresAcknowledgement || !data.deadlineAt) return true;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const deadlineDay = new Date(data.deadlineAt);
      deadlineDay.setHours(0, 0, 0, 0);
      return deadlineDay.getTime() >= startOfToday.getTime();
    },
    {
      message: 'Acknowledgement deadline cannot be in the past.',
      path: ['deadlineAt'],
    },
  );
export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;

export const respondCommunicationSchema = z.object({
  responseText: z.string().max(2000).optional(),
});
export type RespondCommunicationInput = z.infer<typeof respondCommunicationSchema>;

export const communicationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type CommunicationIdParam = z.infer<typeof communicationIdParamSchema>;
