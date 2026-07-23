import { EventModel } from '../models/Event';
import { EventParticipantModel } from '../models/EventParticipant';
import { NotFoundError } from '../utils/AppError';
import { CreateEventInput } from '../validators/event.validator';

export const eventService = {
  async create(input: CreateEventInput, createdBy: number) {
    return EventModel.create({
      name: input.name,
      description: input.description ?? null,
      eventDate: new Date(input.eventDate),
      location: input.location ?? null,
      createdBy,
    });
  },

  async list() {
    return EventModel.listAll();
  },

  async getWithParticipants(eventId: number) {
    const event = await EventModel.findById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    const participants = await EventParticipantModel.listByEventId(eventId);
    return { event, participants };
  },

  async recordParticipation(
    eventId: number,
    entries: { userId: number; participated: boolean; willParticipate?: boolean | null }[],
    recordedBy: number
  ) {
    const event = await EventModel.findById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    return Promise.all(
      entries.map((entry) =>
        EventParticipantModel.recordParticipation(
          eventId,
          entry.userId,
          entry.participated,
          recordedBy,
          entry.willParticipate
        )
      )
    );
  },
};
