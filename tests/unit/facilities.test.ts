import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { BookingStatus, UserRole } from "../../src/types";

vi.mock("../../src/modules/facilities/Facility", () => ({
  FacilityModel: {
    getAll: vi.fn(),
    getAvailableByTypeAndTime: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../src/modules/facilities/FacilityBooking", () => ({
  FacilityBookingModel: {
    checkAvailability: vi.fn(),
    create: vi.fn(),
    getAll: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));

import { FacilityModel } from "../../src/modules/facilities/Facility";
import { FacilityBookingModel } from "../../src/modules/facilities/FacilityBooking";
import { EmployeeModel } from "../../src/employees/Employee";
import { FacilitiesService } from "../../src/modules/facilities/facilities.service";
import { FacilitiesController } from "../../src/modules/facilities/facilities.controller";

const fm = FacilityModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const fbm = FacilityBookingModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

const employee = { userId: 1, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any;
const hr = { userId: 2, employeeId: "HR1", role: UserRole.HR_MANAGER } as any;

describe("FacilitiesService", () => {
  const service = new FacilitiesService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAvailable", () => {
    it("requires type/start_time/end_time", async () => {
      await expect(service.getAvailable(undefined as any, "", "")).rejects.toThrow(BadRequestException);
    });

    it("rejects an invalid date range", async () => {
      await expect(
        service.getAvailable("workstation" as any, "not-a-date", "2026-01-01"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects end_time before or equal to start_time", async () => {
      await expect(
        service.getAvailable("workstation" as any, "2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns available facilities for a valid range", async () => {
      fm.getAvailableByTypeAndTime.mockResolvedValue([{ id: 1 }]);
      const result = await service.getAvailable("workstation" as any, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
      expect(result).toEqual([{ id: 1 }]);
    });
  });

  describe("update / delete", () => {
    it("throws NotFoundException when updating a missing facility", async () => {
      fm.update.mockResolvedValue(null);
      await expect(service.update(1, {} as any)).rejects.toThrow(NotFoundException);
    });

    it("returns the updated facility", async () => {
      fm.update.mockResolvedValue({ id: 1, name: "Room A" });
      const result = await service.update(1, {} as any);
      expect(result).toEqual({ id: 1, name: "Room A" });
    });

    it("delete returns a confirmation message", async () => {
      const result = await service.delete(1);
      expect(fm.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual({ message: "Facility deleted successfully" });
    });
  });

  describe("createBooking", () => {
    const dto = { facility_id: 1, start_time: "2026-01-01T09:00:00Z", end_time: "2026-01-01T10:00:00Z", purpose: "Meeting" } as any;

    it("rejects an employee with no employeeId", async () => {
      fbm.checkAvailability.mockResolvedValue(true);
      await expect(service.createBooking({ ...employee, employeeId: null }, dto)).rejects.toThrow(BadRequestException);
    });

    it("rejects when the slot isn't available", async () => {
      fbm.checkAvailability.mockResolvedValue(false);
      await expect(service.createBooking(employee, dto)).rejects.toThrow(BadRequestException);
    });

    it("creates a confirmed booking when available", async () => {
      fbm.checkAvailability.mockResolvedValue(true);
      fbm.create.mockResolvedValue({ id: 1 });
      const result = await service.createBooking(employee, dto);
      expect(fbm.create).toHaveBeenCalledWith(
        expect.objectContaining({ facility_id: 1, employee_id: "EMP1", status: BookingStatus.CONFIRMED }),
      );
      expect(result).toEqual({ id: 1 });
    });
  });

  describe("getMyBookings", () => {
    it("requires an employeeId", () => {
      expect(() => service.getMyBookings({ ...employee, employeeId: null })).toThrow(BadRequestException);
    });

    it("lists the caller's bookings", () => {
      fbm.getAll.mockReturnValue([{ id: 1 }]);
      service.getMyBookings(employee);
      expect(fbm.getAll).toHaveBeenCalledWith({ employee_id: "EMP1" });
    });
  });

  describe("getAllBookings", () => {
    it("resolves user_id to an employeeId filter", async () => {
      em.findById.mockResolvedValue({ employeeId: "EMP5" });
      fbm.getAll.mockResolvedValue([]);
      await service.getAllBookings({ user_id: 5 });
      expect(fbm.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: "EMP5" }),
      );
    });

    it("passes through facility_id/status/date filters without a user_id", async () => {
      fbm.getAll.mockResolvedValue([]);
      await service.getAllBookings({ facility_id: 2, status: BookingStatus.CONFIRMED });
      expect(fbm.getAll).toHaveBeenCalledWith({
        employee_id: undefined,
        facility_id: 2,
        status: BookingStatus.CONFIRMED,
        start_date: undefined,
        end_date: undefined,
      });
    });
  });

  describe("cancelBooking", () => {
    it("throws NotFoundException when the booking doesn't exist", async () => {
      fbm.findById.mockResolvedValue(null);
      await expect(service.cancelBooking(1, employee)).rejects.toThrow(NotFoundException);
    });

    it("forbids a plain employee cancelling someone else's booking", async () => {
      fbm.findById.mockResolvedValue({ id: 1, employee_id: "OTHER" });
      await expect(service.cancelBooking(1, employee)).rejects.toThrow(ForbiddenException);
    });

    it("allows the owner to cancel their own booking", async () => {
      fbm.findById.mockResolvedValue({ id: 1, employee_id: "EMP1" });
      const result = await service.cancelBooking(1, employee);
      expect(fbm.updateStatus).toHaveBeenCalledWith(1, BookingStatus.CANCELLED);
      expect(result).toEqual({ message: "Booking cancelled" });
    });

    it("allows HR to cancel any booking regardless of ownership", async () => {
      fbm.findById.mockResolvedValue({ id: 1, employee_id: "OTHER" });
      const result = await service.cancelBooking(1, hr);
      expect(result).toEqual({ message: "Booking cancelled" });
    });
  });
});

describe("FacilitiesController", () => {
  const createServiceMock = () => ({
    getAvailable: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createBooking: vi.fn(),
    getMyBookings: vi.fn(),
    getAllBookings: vi.fn(),
    cancelBooking: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: FacilitiesController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new FacilitiesController(service as any);
  });

  it("getAllFacilities routes to getAvailable when a time window is given", () => {
    controller.getAllFacilities("workstation" as any, "2026-01-01", "2026-01-02");
    expect(service.getAvailable).toHaveBeenCalledWith("workstation", "2026-01-01", "2026-01-02");
  });

  it("getAllFacilities routes to getAll otherwise", () => {
    controller.getAllFacilities("workstation" as any);
    expect(service.getAll).toHaveBeenCalledWith("workstation");
  });

  it("getAllBookings routes to getMyBookings when mine=true", () => {
    controller.getAllBookings(employee, "true");
    expect(service.getMyBookings).toHaveBeenCalledWith(employee);
  });

  it("getAllBookings routes to getAllBookings with numeric filters otherwise", () => {
    controller.getAllBookings(employee, undefined, "5", "2", "confirmed", "2026-01-01", "2026-01-31");
    expect(service.getAllBookings).toHaveBeenCalledWith({
      user_id: 5,
      facility_id: 2,
      status: "confirmed",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });
  });

  it("cancelBooking parses the id param", () => {
    controller.cancelBooking("9", employee);
    expect(service.cancelBooking).toHaveBeenCalledWith(9, employee);
  });
});
