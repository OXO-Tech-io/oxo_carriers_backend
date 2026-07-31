import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { AppError } from "../../src/utils/AppError";

vi.mock("../../src/modules/events/Event", () => ({
  EventModel: { create: vi.fn(), listAll: vi.fn(), findById: vi.fn() },
}));
vi.mock("../../src/modules/events/EventParticipant", () => ({
  EventParticipantModel: { listByEventId: vi.fn(), recordParticipation: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByIds: vi.fn() },
}));

import { EventModel } from "../../src/modules/events/Event";
import { EventParticipantModel } from "../../src/modules/events/EventParticipant";
import { EmployeeModel } from "../../src/employees/Employee";
import { eventService } from "../../src/modules/events/event.service";
import { EventsService } from "../../src/modules/events/events.service";
import { EventsController } from "../../src/modules/events/events.controller";

const em = EventModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const epm = EventParticipantModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const employeeModel = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("eventService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create maps the input into an EventModel payload with defaults", async () => {
    em.create.mockResolvedValue({ id: 1 });
    await eventService.create({ name: "Meetup", eventDate: "2026-12-01" } as any, 9);
    expect(em.create).toHaveBeenCalledWith({
      name: "Meetup",
      description: null,
      eventDate: new Date("2026-12-01"),
      location: null,
      createdBy: 9,
    });
  });

  it("list delegates to EventModel.listAll", async () => {
    em.listAll.mockResolvedValue([{ id: 1 }]);
    expect(await eventService.list()).toEqual([{ id: 1 }]);
  });

  it("getWithParticipants throws a 404 AppError when the event is missing", async () => {
    em.findById.mockResolvedValue(null);
    await expect(eventService.getWithParticipants(1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getWithParticipants returns the event and its participants", async () => {
    em.findById.mockResolvedValue({ id: 1, name: "Meetup" });
    epm.listByEventId.mockResolvedValue([{ id: 1 }]);
    const result = await eventService.getWithParticipants(1);
    expect(result).toEqual({ event: { id: 1, name: "Meetup" }, participants: [{ id: 1 }] });
  });

  describe("recordParticipation", () => {
    it("throws a 404 AppError when the event is missing", async () => {
      em.findById.mockResolvedValue(null);
      await expect(eventService.recordParticipation(1, [], 9)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("resolves each participant's businessEmployeeId and records participation", async () => {
      em.findById.mockResolvedValue({ id: 1 });
      employeeModel.findByIds.mockResolvedValue([{ id: 10, employeeId: "EMP10" }]);
      epm.recordParticipation.mockResolvedValue({ ok: true });
      const result = await eventService.recordParticipation(
        1,
        [{ userId: 10, participated: true, willParticipate: null }],
        9,
      );
      expect(epm.recordParticipation).toHaveBeenCalledWith(1, "EMP10", true, 9, null);
      expect(result).toEqual([{ ok: true }]);
    });

    it("throws a 400 AppError for an entry whose employeeId can't be resolved", async () => {
      em.findById.mockResolvedValue({ id: 1 });
      employeeModel.findByIds.mockResolvedValue([]);
      await expect(
        eventService.recordParticipation(1, [{ userId: 99, participated: true }], 9),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});

describe("EventsService (thin wrapper)", () => {
  it("delegates all methods to eventService", async () => {
    em.create.mockResolvedValue({ id: 1 });
    em.listAll.mockResolvedValue([]);
    em.findById.mockResolvedValue({ id: 1 });
    epm.listByEventId.mockResolvedValue([]);
    epm.recordParticipation.mockResolvedValue({});
    employeeModel.findByIds.mockResolvedValue([{ id: 1, employeeId: "EMP1" }]);

    const service = new EventsService();
    await service.create({ name: "E", eventDate: "2026-01-01" } as any, 1);
    await service.list();
    await service.getWithParticipants(1);
    await service.recordParticipation(1, { participants: [{ userId: 1, participated: true }] } as any, 1);
  });
});

describe("EventsController", () => {
  const createServiceMock = () => ({
    list: vi.fn(),
    create: vi.fn(),
    getWithParticipants: vi.fn(),
    recordParticipation: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: EventsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new EventsController(service as any);
  });

  it("list returns a success envelope", async () => {
    service.list.mockResolvedValue([{ id: 1 }]);
    const result = await controller.list();
    expect(result).toEqual({ success: true, message: "Events fetched", data: [{ id: 1 }] });
  });

  it("create passes the current employee's userId", async () => {
    service.create.mockResolvedValue({ id: 1 });
    const result = await controller.create({ userId: 9 } as any, { name: "E" } as any);
    expect(service.create).toHaveBeenCalledWith({ name: "E" }, 9);
    expect(result.data).toEqual({ id: 1 });
  });

  it("getById rejects a non-numeric id", async () => {
    await expect(controller.getById("abc")).rejects.toThrow(BadRequestException);
  });

  it("getById parses the id and returns data", async () => {
    service.getWithParticipants.mockResolvedValue({ event: {}, participants: [] });
    const result = await controller.getById("5");
    expect(service.getWithParticipants).toHaveBeenCalledWith(5);
    expect(result.message).toBe("Event fetched");
  });

  it("recordParticipation rejects a non-numeric id", async () => {
    await expect(controller.recordParticipation({} as any, "abc", {} as any)).rejects.toThrow(BadRequestException);
  });

  it("recordParticipation delegates with the parsed id", async () => {
    service.recordParticipation.mockResolvedValue([{ ok: true }]);
    const result = await controller.recordParticipation({ userId: 3 } as any, "7", { participants: [] } as any);
    expect(service.recordParticipation).toHaveBeenCalledWith(7, { participants: [] }, 3);
    expect(result.data).toEqual([{ ok: true }]);
  });
});
