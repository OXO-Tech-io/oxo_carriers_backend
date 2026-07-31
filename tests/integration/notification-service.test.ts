import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmployeeModel } from "../../src/employees/Employee";
import { notificationService } from "../../src/modules/notifications/notification.service";
import { UserRole } from "../../src/types";

describe("notificationService", () => {
  let testUser: any = null;
  const testEmployeeId = "TEST_EMP_NOTIF_999";
  const testEmail = "test_notif_user@example.com";

  beforeAll(async () => {
    const existing = await EmployeeModel.findByEmployeeId(testEmployeeId);
    if (existing) await EmployeeModel.delete(existing.id);

    testUser = await EmployeeModel.create({
      employee_id: testEmployeeId,
      email: testEmail,
      password: "Test1234!",
      first_name: "Test",
      last_name: "Notif User",
      role: UserRole.EMPLOYEE,
    });
  });

  afterAll(async () => {
    if (testUser) await EmployeeModel.delete(testUser.id);
  });

  it("creates a notification, tracks unread count, and marks it read", async () => {
    const before = await notificationService.unreadCount(testUser.employeeId);

    const created = await notificationService.notify(
      testUser.employeeId,
      "profile_change_approved",
      "Profile change approved",
      "Your profile change request has been approved.",
      { requestId: 1 },
      "/profile?tab=pending-changes"
    );
    expect(created.employeeId).toBe(testUser.employeeId);
    expect(created.isRead).toBe(false);

    const afterCreate = await notificationService.unreadCount(testUser.employeeId);
    expect(afterCreate).toBe(before + 1);

    const list = await notificationService.listForUser(testUser.employeeId);
    expect(list.some(n => n.id === created.id)).toBe(true);

    await notificationService.markRead(created.id, testUser.employeeId);
    const afterRead = await notificationService.unreadCount(testUser.employeeId);
    expect(afterRead).toBe(before);
  });

  it("marks all notifications for a user as read", async () => {
    await notificationService.notify(testUser.employeeId, "test_type", "Title A", "Message A");
    await notificationService.notify(testUser.employeeId, "test_type", "Title B", "Message B");

    const beforeCount = await notificationService.unreadCount(testUser.employeeId);
    expect(beforeCount).toBeGreaterThanOrEqual(2);

    await notificationService.markAllRead(testUser.employeeId);
    const afterCount = await notificationService.unreadCount(testUser.employeeId);
    expect(afterCount).toBe(0);
  });
});
