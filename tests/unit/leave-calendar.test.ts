import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";

vi.mock("../../src/modules/leave-calendar/LeaveCalendar", () => ({
  LeaveCalendarModel: {
    getByYear: vi.fn(),
    getAll: vi.fn(),
    getByDateRange: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getHolidayCount: vi.fn(),
    isHoliday: vi.fn(),
  },
}));

import { LeaveCalendarModel } from "../../src/modules/leave-calendar/LeaveCalendar";
import { LeaveCalendarService } from "../../src/modules/leave-calendar/leave-calendar.service";
import { LeaveCalendarController } from "../../src/modules/leave-calendar/leave-calendar.controller";

const lcm = LeaveCalendarModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("LeaveCalendarService", () => {
  const service = new LeaveCalendarService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAllCalendarEntries uses getByYear when a year is given", async () => {
    lcm.getByYear.mockResolvedValue([{ id: 1 }]);
    const result = await service.getAllCalendarEntries(2026);
    expect(lcm.getByYear).toHaveBeenCalledWith(2026);
    expect(result).toEqual({ success: true, data: [{ id: 1 }] });
  });

  it("getAllCalendarEntries uses getAll without a year", async () => {
    lcm.getAll.mockResolvedValue([]);
    await service.getAllCalendarEntries(undefined);
    expect(lcm.getAll).toHaveBeenCalled();
  });

  it("getCalendarByDateRange requires both dates", async () => {
    await expect(service.getCalendarByDateRange(undefined, "2026-01-31")).rejects.toThrow(BadRequestException);
  });

  it("getCalendarByDateRange returns entries for a valid range", async () => {
    lcm.getByDateRange.mockResolvedValue([{ id: 1 }]);
    const result = await service.getCalendarByDateRange("2026-01-01", "2026-01-31");
    expect(result).toEqual({ success: true, data: [{ id: 1 }] });
  });

  describe("createCalendarEntry", () => {
    it("requires date and name", async () => {
      await expect(service.createCalendarEntry(1, { name: "X" } as any)).rejects.toThrow(BadRequestException);
    });

    it("rejects a duplicate holiday date", async () => {
      lcm.getByDateRange.mockResolvedValue([{ id: 1 }]);
      await expect(
        service.createCalendarEntry(1, { date: "2026-01-01", name: "New Year" } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a new calendar entry, normalizing is_recurring", async () => {
      lcm.getByDateRange.mockResolvedValue([]);
      lcm.create.mockResolvedValue({ id: 1 });
      const result = await service.createCalendarEntry(9, {
        date: "2026-01-01",
        name: "New Year",
        is_recurring: "true",
      } as any);
      expect(lcm.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_recurring: true, created_by: 9 }),
      );
      expect(result.message).toBe("Calendar entry created successfully");
    });
  });

  describe("deleteCalendarEntry", () => {
    it("throws NotFoundException when nothing was deleted", async () => {
      lcm.delete.mockResolvedValue(false);
      await expect(service.deleteCalendarEntry(1)).rejects.toThrow(NotFoundException);
    });

    it("returns a success message when deleted", async () => {
      lcm.delete.mockResolvedValue(true);
      const result = await service.deleteCalendarEntry(1);
      expect(result.message).toBe("Calendar entry deleted successfully");
    });
  });

  describe("getHolidayCount / checkIsHoliday", () => {
    it("getHolidayCount requires both dates", async () => {
      await expect(service.getHolidayCount(undefined, undefined)).rejects.toThrow(BadRequestException);
    });

    it("getHolidayCount returns a count", async () => {
      lcm.getHolidayCount.mockResolvedValue(3);
      const result = await service.getHolidayCount("2026-01-01", "2026-01-31");
      expect(result).toEqual({ success: true, count: 3 });
    });

    it("checkIsHoliday requires a date", async () => {
      await expect(service.checkIsHoliday(undefined)).rejects.toThrow(BadRequestException);
    });

    it("checkIsHoliday returns the holiday flag", async () => {
      lcm.isHoliday.mockResolvedValue(true);
      const result = await service.checkIsHoliday("2026-01-01");
      expect(result).toEqual({ success: true, isHoliday: true });
    });
  });
});

describe("LeaveCalendarController", () => {
  const createServiceMock = () => ({
    getAllCalendarEntries: vi.fn(),
    getCalendarByYear: vi.fn(),
    getCalendarByDateRange: vi.fn(),
    getHolidayCount: vi.fn(),
    checkIsHoliday: vi.fn(),
    createCalendarEntry: vi.fn(),
    updateCalendarEntry: vi.fn(),
    deleteCalendarEntry: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: LeaveCalendarController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new LeaveCalendarController(service as any);
  });

  it("getAllCalendarEntries parses the year query param", () => {
    controller.getAllCalendarEntries("2026");
    expect(service.getAllCalendarEntries).toHaveBeenCalledWith(2026);
  });

  it("updateCalendarEntry rejects a non-numeric id", () => {
    expect(() => controller.updateCalendarEntry("abc", {} as any)).toThrow(BadRequestException);
  });

  it("deleteCalendarEntry rejects a non-numeric id", () => {
    expect(() => controller.deleteCalendarEntry("abc")).toThrow(BadRequestException);
  });

  it("deleteCalendarEntry delegates with the parsed id", () => {
    controller.deleteCalendarEntry("3");
    expect(service.deleteCalendarEntry).toHaveBeenCalledWith(3);
  });
});
