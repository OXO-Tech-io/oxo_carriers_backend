import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { listNotificationsQuerySchema, notificationIdParamSchema } from '../validators/notification.validator';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  validate(listNotificationsQuerySchema, 'query'),
  asyncHandler(notificationController.listMine)
);

router.get('/unread-count', asyncHandler(notificationController.unreadCount));

router.patch(
  '/:id/read',
  validate(notificationIdParamSchema, 'params'),
  asyncHandler(notificationController.markRead)
);

router.patch('/read-all', asyncHandler(notificationController.markAllRead));

export default router;
