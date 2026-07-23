import { EventModel } from '../models/Event';
import { EventParticipantModel } from '../models/EventParticipant';
import { EmployeeModel } from '../models/Employee';
import { BadRequestError, NotFoundError } from '../utils/AppError';
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

    // `entry.userId` on the wire is the target employee's internal numeric id
    // (unchanged API surface) - resolve each to the business employeeId that
    // tbl_event_participants.employee_id now stores.
    const employees = await EmployeeModel.findByIds(entries.map((entry) => entry.userId));
    const employeeIdByUserId = new Map(employees.map((emp) => [emp.id, emp.employeeId]));

    return Promise.all(
      entries.map((entry) => {
        const employeeId = employeeIdByUserId.get(entry.userId);
        if (!employeeId) {
          throw new BadRequestError(`Employee ${entry.userId} not found or has no employeeId`);
        }
        return EventParticipantModel.recordParticipation(
          eventId,
          employeeId,
          entry.participated,
          recordedBy,
          entry.willParticipate
        );
      })
    );
  },
};
