import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "../../src/types";
import { FormsController } from "../../src/modules/forms/forms.controller";

const createServiceMock = () => ({
  listAssignedToMe: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  getFormWithGraph: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  duplicate: vi.fn(),
  publish: vi.fn(),
  distribute: vi.fn(),
  getMyResponse: vi.fn(),
  submitResponse: vi.fn(),
  listResponses: vi.fn(),
  exportResponses: vi.fn(),
  createSection: vi.fn(),
  reorderSections: vi.fn(),
  createQuestion: vi.fn(),
  reorderQuestions: vi.fn(),
});

const createRes = () => ({ setHeader: vi.fn(), send: vi.fn() });

const employee = { userId: 1, role: UserRole.EMPLOYEE } as any;
const hr = { userId: 2, role: UserRole.HR_MANAGER } as any;

describe("FormsController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: FormsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new FormsController(service as any);
  });

  describe("list", () => {
    it("returns forms assigned to the caller when mine=true, for any role", async () => {
      service.listAssignedToMe.mockResolvedValue([{ id: 1 }]);
      const result = await controller.list(employee, "true");
      expect(service.listAssignedToMe).toHaveBeenCalledWith(1);
      expect(result.data).toEqual([{ id: 1 }]);
    });

    it("forbids a non-HR caller from listing all forms", async () => {
      await expect(controller.list(employee, undefined)).rejects.toThrow(ForbiddenException);
    });

    it("allows HR to list all forms", async () => {
      service.list.mockResolvedValue([{ id: 2 }]);
      const result = await controller.list(hr, undefined);
      expect(result.data).toEqual([{ id: 2 }]);
    });
  });

  it("getById rejects a non-numeric id", async () => {
    await expect(controller.getById("abc")).rejects.toThrow(BadRequestException);
  });

  it("create forwards the current employee's userId", async () => {
    service.create.mockResolvedValue({ id: 1 });
    await controller.create(hr, { title: "T" });
    expect(service.create).toHaveBeenCalledWith({ title: "T" }, hr.userId);
  });

  it("submitResponse defaults files to an empty array when none are uploaded", async () => {
    service.submitResponse.mockResolvedValue({ response: {}, answers: [] });
    await controller.submitResponse(employee, "1", { answers: [] }, undefined);
    expect(service.submitResponse).toHaveBeenCalledWith(1, employee.userId, { answers: [] }, []);
  });

  describe("exportResponses", () => {
    it("streams xlsx by default", async () => {
      service.exportResponses.mockResolvedValue(Buffer.from("data"));
      const res = createRes();
      await controller.exportResponses("1", undefined, res as any);
      expect(service.exportResponses).toHaveBeenCalledWith(1, "xlsx");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    });

    it("streams csv when format=csv", async () => {
      service.exportResponses.mockResolvedValue(Buffer.from("data"));
      const res = createRes();
      await controller.exportResponses("1", "csv", res as any);
      expect(service.exportResponses).toHaveBeenCalledWith(1, "csv");
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=form-1-responses.csv",
      );
    });

    it("rejects a non-numeric id", async () => {
      await expect(controller.exportResponses("abc", undefined, createRes() as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  it("createSection parses formId and delegates", async () => {
    service.createSection.mockResolvedValue({ id: 1 });
    await controller.createSection("3", { title: "S" });
    expect(service.createSection).toHaveBeenCalledWith(3, { title: "S" });
  });

  it("reorderSections still validates the formId even though it isn't otherwise used", async () => {
    await expect(controller.reorderSections("abc", {})).rejects.toThrow(BadRequestException);
  });
});
