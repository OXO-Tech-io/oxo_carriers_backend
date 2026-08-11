import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole } from "../../src/types";

vi.mock("../../src/modules/employee-notes/employeeNote.service", () => ({
  employeeNoteService: {
    create: vi.fn(),
    listForEmployee: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findById: vi.fn() },
}));

import { employeeNoteService } from "../../src/modules/employee-notes/employeeNote.service";
import { EmployeeModel } from "../../src/employees/Employee";
import { EmployeeNotesService } from "../../src/modules/employee-notes/employee-notes.service";
import { EmployeeNotesController } from "../../src/modules/employee-notes/employee-notes.controller";

const createMock = employeeNoteService.create as unknown as ReturnType<typeof vi.fn>;
const listForEmployeeMock = employeeNoteService.listForEmployee as unknown as ReturnType<typeof vi.fn>;
const getByIdMock = employeeNoteService.getById as unknown as ReturnType<typeof vi.fn>;
const updateMock = employeeNoteService.update as unknown as ReturnType<typeof vi.fn>;
const findByIdMock = EmployeeModel.findById as unknown as ReturnType<typeof vi.fn>;

describe("EmployeeNotesService", () => {
  const service = new EmployeeNotesService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("rejects roles that aren't allowed to create notes", async () => {
      await expect(
        service.create(
          { userId: 1, role: UserRole.EMPLOYEE } as any,
          { employeeId: 5, content: "note" } as any,
          [],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when the target has no employeeId yet", async () => {
      findByIdMock.mockResolvedValue({ employeeId: null });
      await expect(
        service.create(
          { userId: 1, role: UserRole.HR_MANAGER } as any,
          { employeeId: 5, content: "note" } as any,
          [],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a note for an allowed role and resolved employee", async () => {
      findByIdMock.mockResolvedValue({ employeeId: "EMP5" });
      createMock.mockResolvedValue({ id: 1, content: "note" });
      const result = await service.create(
        { userId: 10, role: UserRole.HR_EXECUTIVE } as any,
        { employeeId: 5, content: "note" } as any,
        [],
      );
      expect(createMock).toHaveBeenCalledWith("EMP5", 10, "note", []);
      expect(result).toEqual({ success: true, message: "Note added", data: { id: 1, content: "note" } });
    });
  });

  describe("listForEmployee", () => {
    it("resolves the business employeeId and lists notes", async () => {
      findByIdMock.mockResolvedValue({ employeeId: "EMP5" });
      listForEmployeeMock.mockResolvedValue([{ id: 1 }]);
      const result = await service.listForEmployee(5);
      expect(listForEmployeeMock).toHaveBeenCalledWith("EMP5");
      expect(result).toEqual({ success: true, message: "Notes fetched", data: [{ id: 1 }] });
    });
  });

  describe("getById", () => {
    it("throws NotFoundException when the note doesn't exist", async () => {
      getByIdMock.mockResolvedValue(null);
      await expect(service.getById(99)).rejects.toThrow(NotFoundException);
    });

    it("returns the note when found", async () => {
      getByIdMock.mockResolvedValue({ id: 1, content: "hi" });
      const result = await service.getById(1);
      expect(result).toEqual({ success: true, message: "Note fetched", data: { id: 1, content: "hi" } });
    });
  });

  describe("update", () => {
    it("throws NotFoundException when the note doesn't exist", async () => {
      updateMock.mockResolvedValue(null);
      await expect(service.update(99, "new content")).rejects.toThrow(NotFoundException);
    });

    it("returns the updated note", async () => {
      updateMock.mockResolvedValue({ id: 1, content: "updated" });
      const result = await service.update(1, "updated");
      expect(result).toEqual({ success: true, message: "Note updated", data: { id: 1, content: "updated" } });
    });
  });
});

describe("EmployeeNotesController", () => {
  let service: EmployeeNotesService;
  let controller: EmployeeNotesController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmployeeNotesService();
    controller = new EmployeeNotesController(service);
  });

  it("create delegates to the service with the current employee and dto", async () => {
    findByIdMock.mockResolvedValue({ employeeId: "EMP5" });
    createMock.mockResolvedValue({ id: 1 });
    await controller.create(
      { userId: 10, role: UserRole.HR_MANAGER } as any,
      { employeeId: 5, content: "note" } as any,
      undefined,
    );
    expect(createMock).toHaveBeenCalledWith("EMP5", 10, "note", []);
  });

  it("listForEmployee rejects a non-numeric employeeId param", () => {
    expect(() => controller.listForEmployee("abc")).toThrow(BadRequestException);
  });

  it("listForEmployee parses the employeeId param and delegates", async () => {
    findByIdMock.mockResolvedValue({ employeeId: "EMP5" });
    listForEmployeeMock.mockResolvedValue([]);
    await controller.listForEmployee("5");
    expect(findByIdMock).toHaveBeenCalledWith(5);
  });

  it("getById rejects a non-numeric id param", () => {
    expect(() => controller.getById("xyz")).toThrow(BadRequestException);
  });

  it("update rejects a non-numeric id param", () => {
    expect(() => controller.update("xyz", { content: "c" } as any)).toThrow(BadRequestException);
  });

  it("update parses the id param and delegates", async () => {
    updateMock.mockResolvedValue({ id: 3, content: "c" });
    await controller.update("3", { content: "c" } as any);
    expect(updateMock).toHaveBeenCalledWith(3, "c");
  });
});
