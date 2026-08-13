import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { DocumentVaultController } from "../../src/modules/document-vault/document-vault.controller";

const createServiceMock = () => ({
  create: vi.fn(),
  listAll: vi.fn(),
  listForEmployee: vi.fn(),
  listForEmployeeByInternalId: vi.fn(),
  delete: vi.fn(),
});

describe("DocumentVaultController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: DocumentVaultController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new DocumentVaultController(service as any);
  });

  describe("listMine", () => {
    it("resolves documents for the caller's own employeeId", async () => {
      service.listForEmployee.mockResolvedValue([{ id: 1 }]);
      const result = await controller.listMine({ employeeId: "EMP1" } as any);
      expect(service.listForEmployee).toHaveBeenCalledWith("EMP1");
      expect(result).toEqual({ success: true, message: "Documents fetched", data: [{ id: 1 }] });
    });
  });

  describe("listAll", () => {
    it("returns the full manage list", async () => {
      service.listAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await controller.listAll();
      expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe("listForEmployee", () => {
    it("parses the internal employee id and delegates", async () => {
      service.listForEmployeeByInternalId.mockResolvedValue([{ id: 1 }]);
      const result = await controller.listForEmployee("5");
      expect(service.listForEmployeeByInternalId).toHaveBeenCalledWith(5);
      expect(result.data).toEqual([{ id: 1 }]);
    });

    it("throws BadRequestException for a non-numeric employee id", async () => {
      await expect(controller.listForEmployee("abc")).rejects.toThrow(BadRequestException);
    });
  });

  it("create delegates to the service with the current employee's userId", async () => {
    service.create.mockResolvedValue({ id: 1 });
    const result = await controller.create({ userId: 9 } as any, { title: "t" }, undefined);
    expect(service.create).toHaveBeenCalledWith(9, { title: "t" }, []);
    expect(result).toEqual({ success: true, message: "Document uploaded", data: { id: 1 } });
  });

  describe("delete", () => {
    it("throws BadRequestException for a non-numeric id", async () => {
      await expect(controller.delete("abc")).rejects.toThrow(BadRequestException);
    });

    it("deletes and returns a success envelope", async () => {
      service.delete.mockResolvedValue(undefined);
      const result = await controller.delete("7");
      expect(service.delete).toHaveBeenCalledWith(7);
      expect(result).toEqual({ success: true, message: "Document deleted" });
    });
  });
});
