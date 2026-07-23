import { Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { JwtPayload } from '../../types';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async listMine(@Query() query: ListNotificationsQueryDto, @CurrentEmployee() employee: JwtPayload) {
    const notifications = await this.notificationsService.listForUser(employee.userId, query);
    return { success: true, message: 'Notifications fetched', data: notifications };
  }

  @Get('unread-count')
  async unreadCount(@CurrentEmployee() employee: JwtPayload) {
    const count = await this.notificationsService.unreadCount(employee.userId);
    return { success: true, message: 'Unread notification count fetched', data: { count } };
  }

  @Patch(':id/read')
  async markRead(@Param('id', ParseIntPipe) id: number, @CurrentEmployee() employee: JwtPayload) {
    await this.notificationsService.markRead(id, employee.userId);
    return { success: true, message: 'Notification marked as read', data: null };
  }

  @Patch('read-all')
  async markAllRead(@CurrentEmployee() employee: JwtPayload) {
    await this.notificationsService.markAllRead(employee.userId);
    return { success: true, message: 'All notifications marked as read', data: null };
  }
}
