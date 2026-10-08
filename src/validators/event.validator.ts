import { z } from 'zod';

export const createEventSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
  eventDate: z.string().min(1, 'Event date is required'),
  location: z.string().max(255).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const recordParticipationSchema = z.object({
  participants: z
    .array(
      z.object({
        userId: z.coerce.number().int().positive(),
        participated: z.boolean(),
        willParticipate: z.boolean().nullable().optional(),
      })
    )
    .min(1, 'At least one participant record is required'),
});
export type RecordParticipationInput = z.infer<typeof recordParticipationSchema>;

export const eventIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type EventIdParam = z.infer<typeof eventIdParamSchema>;
