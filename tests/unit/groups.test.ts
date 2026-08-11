import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/groups/Group", () => ({
  GroupModel: {
    listAll: vi.fn(),
    findById: vi.fn(),
    listMembers: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    addMembers: vi.fn(),
    removeMember: vi.fn(),
    getMemberUserIds: vi.fn(),
  },
}));

import { GroupModel } from "../../src/modules/groups/Group";
import { groupService } from "../../src/modules/groups/group.service";
import { GroupsService } from "../../src/modules/groups/groups.service";
import { GroupsController } from "../../src/modules/groups/groups.controller";

const gm = GroupModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("groupService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list delegates to GroupModel.listAll", async () => {
    gm.listAll.mockResolvedValue([{ id: 1 }]);
    expect(await groupService.list()).toEqual([{ id: 1 }]);
  });

  describe("getById", () => {
    it("throws a 404 AppError when the group is missing", async () => {
      gm.findById.mockResolvedValue(null);
      await expect(groupService.getById(1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns the group with its members", async () => {
      gm.findById.mockResolvedValue({ id: 1, name: "Eng" });
      gm.listMembers.mockResolvedValue([{ userId: 1 }]);
      const result = await groupService.getById(1);
      expect(result).toEqual({ group: { id: 1, name: "Eng" }, members: [{ userId: 1 }] });
    });
  });

  describe("create", () => {
    it("throws a 409 AppError for a duplicate name", async () => {
      gm.findByName.mockResolvedValue({ id: 1 });
      await expect(groupService.create("Eng", 1)).rejects.toMatchObject({ statusCode: 409 });
    });

    it("creates the group when the name is free", async () => {
      gm.findByName.mockResolvedValue(null);
      gm.create.mockResolvedValue({ id: 2, name: "New" });
      const result = await groupService.create("New", 1);
      expect(result).toEqual({ id: 2, name: "New" });
    });
  });

  describe("rename", () => {
    it("allows renaming to the same name it already has", async () => {
      gm.findByName.mockResolvedValue({ id: 1, name: "Eng" });
      gm.rename.mockResolvedValue({ id: 1, name: "Eng" });
      const result = await groupService.rename(1, "Eng");
      expect(result).toEqual({ id: 1, name: "Eng" });
    });

    it("throws a 409 AppError when another group already has that name", async () => {
      gm.findByName.mockResolvedValue({ id: 2, name: "Taken" });
      await expect(groupService.rename(1, "Taken")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("throws a 404 AppError when the group to rename doesn't exist", async () => {
      gm.findByName.mockResolvedValue(null);
      gm.rename.mockResolvedValue(null);
      await expect(groupService.rename(1, "New")).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("remove / addMembers / removeMember", () => {
    it("remove throws a 404 AppError for a missing group", async () => {
      gm.findById.mockResolvedValue(null);
      await expect(groupService.remove(1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("remove deletes an existing group", async () => {
      gm.findById.mockResolvedValue({ id: 1 });
      await groupService.remove(1);
      expect(gm.delete).toHaveBeenCalledWith(1);
    });

    it("addMembers throws a 404 AppError for a missing group", async () => {
      gm.findById.mockResolvedValue(null);
      await expect(groupService.addMembers(1, [1, 2], 9)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("addMembers delegates when the group exists", async () => {
      gm.findById.mockResolvedValue({ id: 1 });
      gm.addMembers.mockResolvedValue([{ userId: 1 }]);
      const result = await groupService.addMembers(1, [1], 9);
      expect(gm.addMembers).toHaveBeenCalledWith(1, [1], 9);
      expect(result).toEqual([{ userId: 1 }]);
    });

    it("removeMember throws a 404 AppError for a missing group", async () => {
      gm.findById.mockResolvedValue(null);
      await expect(groupService.removeMember(1, 5)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("removeMember delegates when the group exists", async () => {
      gm.findById.mockResolvedValue({ id: 1 });
      await groupService.removeMember(1, 5);
      expect(gm.removeMember).toHaveBeenCalledWith(1, 5);
    });
  });

  it("resolveMemberUserIds delegates to GroupModel.getMemberUserIds", async () => {
    gm.getMemberUserIds.mockResolvedValue([1, 2]);
    expect(await groupService.resolveMemberUserIds([1])).toEqual([1, 2]);
  });
});

describe("GroupsService (thin wrapper) + GroupsController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GroupsService.create forwards dto.name and createdBy", async () => {
    gm.findByName.mockResolvedValue(null);
    gm.create.mockResolvedValue({ id: 1 });
    const service = new GroupsService();
    await service.create({ name: "Eng" } as any, 9);
    expect(gm.create).toHaveBeenCalledWith("Eng", 9);
  });

  it("GroupsController.list wraps the service result", async () => {
    const service = { list: vi.fn().mockResolvedValue([{ id: 1 }]) };
    const controller = new GroupsController(service as any);
    const result = await controller.list();
    expect(result).toEqual({ success: true, message: "Groups fetched", data: [{ id: 1 }] });
  });

  it("GroupsController.remove wraps a success envelope", async () => {
    const service = { remove: vi.fn().mockResolvedValue(undefined) };
    const controller = new GroupsController(service as any);
    const result = await controller.remove(1);
    expect(result).toEqual({ success: true, message: "Group deleted", data: {} });
  });

  it("GroupsController.addMembers delegates with the current employee's userId", async () => {
    const service = { addMembers: vi.fn().mockResolvedValue([{ userId: 2 }]) };
    const controller = new GroupsController(service as any);
    const result = await controller.addMembers(1, { userIds: [2] } as any, { userId: 9 } as any);
    expect(service.addMembers).toHaveBeenCalledWith(1, { userIds: [2] }, 9);
    expect(result.data).toEqual([{ userId: 2 }]);
  });

  it("GroupsController.removeMember wraps a success envelope", async () => {
    const service = { removeMember: vi.fn().mockResolvedValue(undefined) };
    const controller = new GroupsController(service as any);
    const result = await controller.removeMember(1, 2);
    expect(service.removeMember).toHaveBeenCalledWith(1, 2);
    expect(result).toEqual({ success: true, message: "Member removed", data: {} });
  });
});
