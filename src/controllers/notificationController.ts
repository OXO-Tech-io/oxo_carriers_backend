import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';
import { ListNotificationsQuery, NotificationIdParam } from '../validators/notification.validator';

const requireUser = (req: Request) => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

export const listMine = async (req: Request, res: Response) => {
  const { userId } = requireUser(req);
  const query = req.query as unknown as ListNotificationsQuery;
  const notifications = await notificationService.listForUser(userId, query);
  ok(res, notifications, 'Notifications fetched');
};

export const unreadCount = async (req: Request, res: Response) => {
  const { userId } = requireUser(req);
  const count = await notificationService.unreadCount(userId);
  ok(res, { count }, 'Unread notification count fetched');
};

export const markRead = async (req: Request, res: Response) => {
  const { userId } = requireUser(req);
  const { id } = req.params as unknown as NotificationIdParam;
  await notificationService.markRead(id, userId);
  ok(res, null, 'Notification marked as read');
};

export const markAllRead = async (req: Request, res: Response) => {
  const { userId } = requireUser(req);
  await notificationService.markAllRead(userId);
  ok(res, null, 'All notifications marked as read');
};
