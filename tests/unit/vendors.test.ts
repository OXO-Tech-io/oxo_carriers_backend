import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";

vi.mock("../../src/modules/vendors/Vendor", () => ({
  VendorModel: { findByEmail: vi.fn(), create: vi.fn(), getAll: vi.fn(), findById: vi.fn() },
}));

import { VendorModel } from "../../src/modules/vendors/Vendor";
import { VendorsService } from "../../src/modules/vendors/vendors.service";
import { VendorsController } from "../../src/modules/vendors/vendors.controller";

const vm = VendorModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("VendorsService", () => {
  const service = new VendorsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("requires an email and company name", async () => {
      await expect(service.create({ company_name: "Acme" } as any)).rejects.toThrow(BadRequestException);
    });

    it("defaults company_name to 'Vendor' when blank, still requiring an email", async () => {
      vm.findByEmail.mockResolvedValue(null);
      vm.create.mockResolvedValue({ id: 1, company_name: "Vendor" });
      await service.create({ email: "v@x.com" } as any);
      expect(vm.create).toHaveBeenCalledWith(expect.objectContaining({ company_name: "Vendor" }));
    });

    it("rejects a duplicate email", async () => {
      vm.findByEmail.mockResolvedValue({ id: 1 });
      await expect(service.create({ email: "v@x.com", company_name: "Acme" } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("creates the vendor with trimmed company name and null optional fields", async () => {
      vm.findByEmail.mockResolvedValue(null);
      vm.create.mockResolvedValue({ id: 2 });
      await service.create({ email: "v@x.com", company_name: "  Acme Corp  " } as any);
      expect(vm.create).toHaveBeenCalledWith({
        email: "v@x.com",
        company_name: "Acme Corp",
        contact_number: null,
        bank_name: null,
        account_holder_name: null,
        account_number: null,
        bank_branch: null,
      });
    });
  });

  it("getAll passes through an optional search term", () => {
    vm.getAll.mockReturnValue([]);
    service.getAll("acme");
    expect(vm.getAll).toHaveBeenCalledWith({ search: "acme" });
    service.getAll();
    expect(vm.getAll).toHaveBeenCalledWith({ search: undefined });
  });

  it("findById delegates directly", () => {
    vm.findById.mockReturnValue({ id: 1 });
    service.findById(1);
    expect(vm.findById).toHaveBeenCalledWith(1);
  });
});

describe("VendorsController", () => {
  const createServiceMock = () => ({ getAll: vi.fn(), findById: vi.fn(), create: vi.fn() });
  let service: ReturnType<typeof createServiceMock>;
  let controller: VendorsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new VendorsController(service as any);
  });

  it("getById rejects a non-numeric id", async () => {
    await expect(controller.getById("abc")).rejects.toThrow(BadRequestException);
  });

  it("getById throws NotFoundException for a missing vendor", async () => {
    service.findById.mockResolvedValue(null);
    await expect(controller.getById("1")).rejects.toThrow(NotFoundException);
  });

  it("getById returns the vendor wrapped in a success envelope", async () => {
    service.findById.mockResolvedValue({ id: 1, company_name: "Acme" });
    const result = await controller.getById("1");
    expect(result).toEqual({ success: true, vendor: { id: 1, company_name: "Acme" } });
  });

  it("create wraps a confirmation message", async () => {
    service.create.mockResolvedValue({ id: 1 });
    const result = await controller.create({ email: "v@x.com" } as any);
    expect(result).toEqual({ success: true, message: "Vendor created successfully.", vendor: { id: 1 } });
  });

  it("getAll forwards the search query", async () => {
    service.getAll.mockResolvedValue([{ id: 1 }]);
    const result = await controller.getAll("acme");
    expect(service.getAll).toHaveBeenCalledWith("acme");
    expect(result).toEqual({ success: true, vendors: [{ id: 1 }] });
  });
});
