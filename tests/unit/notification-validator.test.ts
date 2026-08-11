import { describe, it, expect } from "vitest";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "../../src/validators/notification.validator";

describe("notification.validator", () => {
  it("listNotificationsQuerySchema accepts an empty query", () => {
    expect(listNotificationsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("listNotificationsQuerySchema coerces isRead from a string", () => {
    const result = listNotificationsQuerySchema.safeParse({ isRead: "true", limit: "10", offset: "0" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isRead).toBe(true);
      expect(result.data.limit).toBe(10);
    }
  });

  it("listNotificationsQuerySchema rejects limit over 100", () => {
    expect(listNotificationsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("notificationIdParamSchema coerces and validates id", () => {
    expect(notificationIdParamSchema.safeParse({ id: "7" }).success).toBe(true);
    expect(notificationIdParamSchema.safeParse({ id: "-1" }).success).toBe(false);
  });
});
