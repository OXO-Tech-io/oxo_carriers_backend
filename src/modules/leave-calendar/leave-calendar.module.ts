import { Module } from '@nestjs/common';
import { LeaveCalendarController } from './leave-calendar.controller';
import { LeaveCalendarService } from './leave-calendar.service';

@Module({
  controllers: [LeaveCalendarController],
  providers: [LeaveCalendarService],
})
export class LeaveCalendarModule {}
