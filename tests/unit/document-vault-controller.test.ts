import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { DocumentVaultController } from "../../src/modules/document-vault/document-vault.controller";

const createServiceMock = () => ({
  create: vi.fn(),
  delete: vi.fn(),
});

describe("DocumentVaultController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: DocumentVaultController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new DocumentVaultController(service as any);
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
