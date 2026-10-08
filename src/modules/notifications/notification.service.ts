import { NotificationModel } from './Notification';

// The one generic in-app notification abstraction for the whole app - reused
// as-is by every future module (HR Notes, Communications, Events, Forms, Work
// Logs), unlike the per-domain email template pattern which needs bespoke HTML
// per event type.
export const notificationService = {
  async notify(
    employeeId: string,
    type: string,
    title: string,
    message: string,
    payload?: unknown,
    link?: string
  ) {
    return NotificationModel.create({ employeeId, type, title, message, payload, link });
  },

  async notifyMany(
    employeeIds: string[],
    type: string,
    title: string,
    message: string,
    payload?: unknown,
    link?: string
  ) {
    return Promise.all(
      employeeIds.map(employeeId => NotificationModel.create({ employeeId, type, title, message, payload, link }))
    );
  },

  async listForUser(employeeId: string, filters?: { isRead?: boolean; limit?: number; offset?: number }) {
    return NotificationModel.listByEmployeeId(employeeId, filters);
  },

  async unreadCount(employeeId: string) {
    return NotificationModel.countUnread(employeeId);
  },

  async markRead(id: number, employeeId: string) {
    return NotificationModel.markRead(id, employeeId);
  },

  async markAllRead(employeeId: string) {
    return NotificationModel.markAllRead(employeeId);
  },
};
