import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../../src/types";
import { PERMISSIONS } from "../../src/common/constants/permissions";
import { PERMISSION_KEY } from "../../src/common/decorators/require-permission.decorator";

vi.mock("../../src/middleware/permissions", () => ({
  hasPermission: vi.fn(),
}));

import { hasPermission } from "../../src/middleware/permissions";
import { NoticesController } from "../../src/modules/notices/notices.controller";

const hasPermissionMock = hasPermission as unknown as ReturnType<typeof vi.fn>;

const createServiceMock = () => ({
  listActive: vi.fn(),
  listAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
});

describe("NoticesController", () => {
  let service: ReturnType<typeof createServiceMock>;
  let controller: NoticesController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createServiceMock();
    controller = new NoticesController(service as any);
  });

  describe("list (status=active is the public dashboard view)", () => {
    it("returns active notices with no permission check when status=active", async () => {
      service.listActive.mockResolvedValue([{ id: 1 }]);
      const result = await controller.list(
        { status: "active" } as any,
        { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any,
      );
      expect(hasPermissionMock).not.toHaveBeenCalled();
      expect(service.listActive).toHaveBeenCalled();
      expect(service.listAll).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: "Notices fetched", data: [{ id: 1 }] });
    });

    it("forbids the full board for a non-write, non-super-admin caller", async () => {
      hasPermissionMock.mockResolvedValue(false);
      await expect(
        controller.list({} as any, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(service.listAll).not.toHaveBeenCalled();
    });

    it("forbids the full board for a caller with no employeeId, without calling hasPermission", async () => {
      await expect(
        controller.list({} as any, { employeeId: undefined, role: UserRole.EMPLOYEE } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(hasPermissionMock).not.toHaveBeenCalled();
    });

    it("allows the full board when hasPermission grants notices:write", async () => {
      hasPermissionMock.mockResolvedValue(true);
      service.listAll.mockResolvedValue([{ id: 2 }]);
      const result = await controller.list({} as any, { employeeId: "EMP1", role: UserRole.EMPLOYEE } as any);
      expect(hasPermissionMock).toHaveBeenCalledWith("EMP1", PERMISSIONS.NOTICES, "write");
      expect(result.data).toEqual([{ id: 2 }]);
    });

    it("allows a super admin to see the full board without a permission lookup", async () => {
      service.listAll.mockResolvedValue([{ id: 3 }]);
      const result = await controller.list(
        {} as any,
        { employeeId: undefined, role: UserRole.SUPER_ADMIN } as any,
      );
      expect(hasPermissionMock).not.toHaveBeenCalled();
      expect(result.data).toEqual([{ id: 3 }]);
    });
  });

  // create/update/remove enforce notices:write purely through
  // @UseGuards(PermissionGuard) + @RequirePermission metadata - PermissionGuard
  // itself is covered generically in permission-guard.test.ts. A plain
  // `new NoticesController(...)` never runs through Nest's guard pipeline, so
  // what's actually verifiable at this level is that the metadata is wired up
  // on each handler (same technique as tests/unit/decorators.test.ts).
  describe("write-permission gating (declarative metadata)", () => {
    const reflector = new Reflector();

    it("create requires notices:write", () => {
      expect(reflector.get(PERMISSION_KEY, NoticesController.prototype.create)).toEqual({
        key: PERMISSIONS.NOTICES,
        level: "write",
      });
    });

    it("update requires notices:write", () => {
      expect(reflector.get(PERMISSION_KEY, NoticesController.prototype.update)).toEqual({
        key: PERMISSIONS.NOTICES,
        level: "write",
      });
    });

    it("remove requires notices:write", () => {
      expect(reflector.get(PERMISSION_KEY, NoticesController.prototype.remove)).toEqual({
        key: PERMISSIONS.NOTICES,
        level: "write",
      });
    });
  });

  describe("create/update/remove delegate to the service", () => {
    it("create delegates to the service with the current employee's userId and the uploaded image", async () => {
      service.create.mockResolvedValue({ id: 1 });
      const image = { filename: "a.png" } as any;
      const result = await controller.create({ title: "t" } as any, image, { userId: 9 } as any);
      expect(service.create).toHaveBeenCalledWith({ title: "t" }, 9, image);
      expect(result).toEqual({ success: true, message: "Notice created", data: { id: 1 } });
    });

    it("update delegates to the service with the parsed id, dto, userId and image", async () => {
      service.update.mockResolvedValue({ id: 5 });
      const result = await controller.update(5, { title: "t2" } as any, undefined, { userId: 9 } as any);
      expect(service.update).toHaveBeenCalledWith(5, { title: "t2" }, 9, undefined);
      expect(result).toEqual({ success: true, message: "Notice updated", data: { id: 5 } });
    });

    it("remove delegates to the service with the parsed id", async () => {
      service.remove.mockResolvedValue(undefined);
      const result = await controller.remove(5);
      expect(service.remove).toHaveBeenCalledWith(5);
      expect(result).toEqual({ success: true, message: "Notice deleted", data: {} });
    });
  });
});
