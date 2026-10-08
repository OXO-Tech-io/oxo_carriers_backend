import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException } from "@nestjs/common";

vi.mock("../../src/middleware/permissions", () => ({
  hasPermission: vi.fn(),
}));

import { hasPermission } from "../../src/middleware/permissions";
import { EmployeeDocumentsController } from "../../src/modules/document-vault/employee-documents.controller";
import { UserRole } from "../../src/types";
import { PERMISSIONS } from "../../src/common/constants/permissions";

const hasPermissionMock = hasPermission as unknown as ReturnType<typeof vi.fn>;

const createServiceMock = () => ({
  listForEmployee: vi.fn(),
  listForEmployeeByInternalId: vi.fn(),
});

describe("EmployeeDocumentsController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: EmployeeDocumentsController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createServiceMock();
    controller = new EmployeeDocumentsController(service as any);
  });

  it("resolves the caller's own merged document view for free, no permission check", async () => {
    service.listForEmployee.mockResolvedValue([{ id: 1 }]);

    const result = await controller.list(9, { userId: 9, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);

    expect(service.listForEmployee).toHaveBeenCalledWith("EMP1");
    expect(hasPermissionMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, message: "Documents fetched", data: [{ id: 1 }] });
  });

  it("requires document_vault write to view another employee's documents", async () => {
    hasPermissionMock.mockResolvedValue(false);

    await expect(
      controller.list(5, { userId: 9, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(service.listForEmployeeByInternalId).not.toHaveBeenCalled();
  });

  it("lets a super admin view another employee's documents without checking the permission", async () => {
    service.listForEmployeeByInternalId.mockResolvedValue([{ id: 2 }]);

    const result = await controller.list(5, { userId: 9, employeeId: "EMP1", role: UserRole.SUPER_ADMIN } as any);

    expect(hasPermissionMock).not.toHaveBeenCalled();
    expect(service.listForEmployeeByInternalId).toHaveBeenCalledWith(5);
    expect(result.data).toEqual([{ id: 2 }]);
  });

  it("allows viewing another employee's documents with document_vault write", async () => {
    hasPermissionMock.mockResolvedValue(true);
    service.listForEmployeeByInternalId.mockResolvedValue([{ id: 3 }]);

    const result = await controller.list(5, { userId: 9, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);

    expect(hasPermissionMock).toHaveBeenCalledWith("EMP1", PERMISSIONS.DOCUMENT_VAULT, "write");
    expect(result.data).toEqual([{ id: 3 }]);
  });
});
