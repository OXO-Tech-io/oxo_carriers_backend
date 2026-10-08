import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationsController } from "../../src/modules/notifications/notifications.controller";
import { NotificationsService } from "../../src/modules/notifications/notifications.service";

vi.mock("../../src/modules/notifications/notification.service", () => ({
  notificationService: {
    listForUser: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

import { notificationService } from "../../src/modules/notifications/notification.service";

const ns = notificationService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const employee = { employeeId: "EMP1" } as any;

describe("NotificationsService (thin wrapper)", () => {
  const service = new NotificationsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates all four methods to notificationService", async () => {
    ns.listForUser.mockResolvedValue([]);
    ns.unreadCount.mockResolvedValue(0);
    ns.markRead.mockResolvedValue(undefined);
    ns.markAllRead.mockResolvedValue(undefined);

    await service.listForUser("EMP1", {} as any);
    expect(ns.listForUser).toHaveBeenCalledWith("EMP1", {});
    await service.unreadCount("EMP1");
    expect(ns.unreadCount).toHaveBeenCalledWith("EMP1");
    await service.markRead(1, "EMP1");
    expect(ns.markRead).toHaveBeenCalledWith(1, "EMP1");
    await service.markAllRead("EMP1");
    expect(ns.markAllRead).toHaveBeenCalledWith("EMP1");
  });
});

describe("NotificationsController", () => {
  const createServiceMock = () => ({
    listForUser: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  });

  let service: ReturnType<typeof createServiceMock>;
  let controller: NotificationsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new NotificationsController(service as any);
  });

  it("listMine wraps the notifications in a success envelope", async () => {
    service.listForUser.mockResolvedValue([{ id: 1 }]);
    const result = await controller.listMine({} as any, employee);
    expect(service.listForUser).toHaveBeenCalledWith("EMP1", {});
    expect(result).toEqual({ success: true, message: "Notifications fetched", data: [{ id: 1 }] });
  });

  it("unreadCount wraps the count", async () => {
    service.unreadCount.mockResolvedValue(3);
    const result = await controller.unreadCount(employee);
    expect(result).toEqual({ success: true, message: "Unread notification count fetched", data: { count: 3 } });
  });

  it("markRead delegates with the parsed id", async () => {
    service.markRead.mockResolvedValue(undefined);
    const result = await controller.markRead(5, employee);
    expect(service.markRead).toHaveBeenCalledWith(5, "EMP1");
    expect(result).toEqual({ success: true, message: "Notification marked as read", data: null });
  });

  it("markAllRead delegates", async () => {
    service.markAllRead.mockResolvedValue(undefined);
    const result = await controller.markAllRead(employee);
    expect(service.markAllRead).toHaveBeenCalledWith("EMP1");
    expect(result).toEqual({ success: true, message: "All notifications marked as read", data: null });
  });
});
