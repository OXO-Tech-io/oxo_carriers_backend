import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentManageController } from "../../src/modules/document-vault/document-manage.controller";

const createServiceMock = () => ({
  listAll: vi.fn(),
});

describe("DocumentManageController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: DocumentManageController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new DocumentManageController(service as any);
  });

  it("defaults to page 1 and the default page size when no query params are given", async () => {
    const page = { items: [{ id: 1 }], total: 1, page: 1, pageSize: 10 };
    service.listAll.mockResolvedValue(page);

    const result = await controller.listAll({});

    expect(service.listAll).toHaveBeenCalledWith(1, 10);
    expect(result).toEqual({ success: true, message: "Documents fetched", data: page });
  });

  it("passes through an explicit page and pageSize", async () => {
    service.listAll.mockResolvedValue({ items: [], total: 30, page: 3, pageSize: 5 });

    await controller.listAll({ page: 3, pageSize: 5 });

    expect(service.listAll).toHaveBeenCalledWith(3, 5);
  });
});
