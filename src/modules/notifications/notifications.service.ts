import { Injectable } from '@nestjs/common';
import { notificationService } from '../../services/notification.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@Injectable()
export class NotificationsService {
  listForUser(userId: number, query: ListNotificationsQueryDto) {
    return notificationService.listForUser(userId, query);
  }

  unreadCount(userId: number) {
    return notificationService.unreadCount(userId);
  }

  markRead(id: number, userId: number) {
    return notificationService.markRead(id, userId);
  }

  markAllRead(userId: number) {
    return notificationService.markAllRead(userId);
  }
}
