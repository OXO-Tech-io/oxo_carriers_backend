import { Injectable } from '@nestjs/common';
import { notificationService } from '../../services/notification.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@Injectable()
export class NotificationsService {
  listForUser(employeeId: string, query: ListNotificationsQueryDto) {
    return notificationService.listForUser(employeeId, query);
  }

  unreadCount(employeeId: string) {
    return notificationService.unreadCount(employeeId);
  }

  markRead(id: number, employeeId: string) {
    return notificationService.markRead(id, employeeId);
  }

  markAllRead(employeeId: string) {
    return notificationService.markAllRead(employeeId);
  }
}
