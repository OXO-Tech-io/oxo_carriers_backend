import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/document-vault/document.service", () => ({
  documentService: {
    create: vi.fn(),
    listAll: vi.fn(),
    listForEmployee: vi.fn(),
    listForEmployeeByInternalId: vi.fn(),
    delete: vi.fn(),
  },
}));

import { documentService } from "../../src/modules/document-vault/document.service";
import { DocumentVaultService } from "../../src/modules/document-vault/document-vault.service";

const ds = documentService as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("DocumentVaultService (thin wrapper)", () => {
  const service = new DocumentVaultService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create parses the body with the zod schema and forwards fields positionally", async () => {
    ds.create.mockResolvedValue({ id: 1 });
    const result = await service.create(9, { title: "Contract", targetType: "all" }, []);
    expect(ds.create).toHaveBeenCalledWith("Contract", null, "all", [], 9, []);
    expect(result).toEqual({ id: 1 });
  });

  it("create propagates a ZodError for an invalid body", async () => {
    await expect(service.create(9, { title: "" }, [])).rejects.toThrow();
  });

  it("listAll/listForEmployee/listForEmployeeByInternalId/delete delegate directly", async () => {
    ds.listAll.mockResolvedValue([1]);
    ds.listForEmployee.mockResolvedValue([2]);
    ds.listForEmployeeByInternalId.mockResolvedValue([3]);
    ds.delete.mockResolvedValue(undefined);

    expect(await service.listAll()).toEqual([1]);
    expect(await service.listForEmployee("EMP1")).toEqual([2]);
    expect(ds.listForEmployee).toHaveBeenCalledWith("EMP1");
    expect(await service.listForEmployeeByInternalId(5)).toEqual([3]);
    expect(ds.listForEmployeeByInternalId).toHaveBeenCalledWith(5);
    await service.delete(7);
    expect(ds.delete).toHaveBeenCalledWith(7);
  });
});
