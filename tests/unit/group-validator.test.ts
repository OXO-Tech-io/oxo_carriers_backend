import { describe, it, expect } from "vitest";
import {
  createGroupSchema,
  renameGroupSchema,
  addGroupMembersSchema,
  groupIdParamSchema,
  groupMemberParamSchema,
} from "../../src/validators/group.validator";

describe("group.validator", () => {
  it("createGroupSchema requires a non-empty name within 150 chars", () => {
    expect(createGroupSchema.safeParse({ name: "Engineering" }).success).toBe(true);
    expect(createGroupSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "a".repeat(151) }).success).toBe(false);
  });

  it("renameGroupSchema behaves the same as createGroupSchema", () => {
    expect(renameGroupSchema.safeParse({ name: "New Name" }).success).toBe(true);
    expect(renameGroupSchema.safeParse({}).success).toBe(false);
  });

  it("addGroupMembersSchema requires at least one userId, coerced to numbers", () => {
    const result = addGroupMembersSchema.safeParse({ userIds: ["1", "2"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.userIds).toEqual([1, 2]);
    expect(addGroupMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
  });

  it("groupIdParamSchema and groupMemberParamSchema coerce ids", () => {
    expect(groupIdParamSchema.safeParse({ id: "3" }).success).toBe(true);
    const member = groupMemberParamSchema.safeParse({ id: "3", userId: "4" });
    expect(member.success).toBe(true);
    if (member.success) expect(member.data).toEqual({ id: 3, userId: 4 });
  });
});
