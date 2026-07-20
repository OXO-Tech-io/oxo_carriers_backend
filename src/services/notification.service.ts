import { NotificationModel } from '../models/Notification';

// The one generic in-app notification abstraction for the whole app - reused
// as-is by every future module (HR Notes, Communications, Events, Forms, Work
// Logs), unlike the per-domain email template pattern which needs bespoke HTML
// per event type.
export const notificationService = {
  async notify(
    userId: number,
    type: string,
    title: string,
    message: string,
    payload?: unknown,
    link?: string
  ) {
    return NotificationModel.create({ userId, type, title, message, payload, link });
  },

  async notifyMany(
    userIds: number[],
    type: string,
    title: string,
    message: string,
    payload?: unknown,
    link?: string
  ) {
    return Promise.all(
      userIds.map(userId => NotificationModel.create({ userId, type, title, message, payload, link }))
    );
  },

  async listForUser(userId: number, filters?: { isRead?: boolean; limit?: number; offset?: number }) {
    return NotificationModel.listByUserId(userId, filters);
  },

  async unreadCount(userId: number) {
    return NotificationModel.countUnread(userId);
  },

  async markRead(id: number, userId: number) {
    return NotificationModel.markRead(id, userId);
  },

  async markAllRead(userId: number) {
    return NotificationModel.markAllRead(userId);
  },
};
