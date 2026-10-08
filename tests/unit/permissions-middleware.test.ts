import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/database", () => ({
  default: { query: vi.fn() },
}));

import pool from "../../src/config/database";
import {
  getUserPermissionAssignments,
  getUserPermissionKeys,
  hasPermission,
} from "../../src/middleware/permissions";

const queryMock = (pool as any).query as ReturnType<typeof vi.fn>;

describe("permissions middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserPermissionAssignments", () => {
    it("maps db rows to camelCase permission assignments", async () => {
      queryMock.mockResolvedValue({
        rows: [
          { permission_key: "vouchers.view", access_level: "read" },
          { permission_key: "leaves", access_level: "write" },
        ],
      });
      const result = await getUserPermissionAssignments("EMP1");
      expect(result).toEqual([
        { key: "vouchers.view", accessLevel: "read" },
        { key: "leaves", accessLevel: "write" },
      ]);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["EMP1"]);
    });

    it("returns an empty array when the user has no permissions", async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const result = await getUserPermissionAssignments("EMP2");
      expect(result).toEqual([]);
    });
  });

  describe("getUserPermissionKeys", () => {
    it("returns only the permission keys", async () => {
      queryMock.mockResolvedValue({
        rows: [{ permission_key: "vouchers.view", access_level: "read" }],
      });
      const result = await getUserPermissionKeys("EMP1");
      expect(result).toEqual(["vouchers.view"]);
    });
  });

  describe("hasPermission", () => {
    it("returns true when the check query returns a row", async () => {
      queryMock.mockResolvedValue({ rows: [{ permission_key: "leaves" }] });
      const result = await hasPermission("EMP1", "leaves" as any, "read");
      expect(result).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["EMP1", "leaves", "read"]);
    });

    it("returns false when the check query returns no rows", async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const result = await hasPermission("EMP1", "leaves" as any, "write");
      expect(result).toBe(false);
    });

    it("defaults requiredLevel to 'read' when omitted", async () => {
      queryMock.mockResolvedValue({ rows: [] });
      await hasPermission("EMP1", "leaves" as any);
      expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["EMP1", "leaves", "read"]);
    });
  });
});
