import { Controller, Get } from '@nestjs/common';
import { LeaveTypesService } from './leave-types.service';

@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  @Get()
  async getLeaveTypes() {
    const types = await this.leaveTypesService.getLeaveTypes();
    return { success: true, message: 'Leave types fetched', data: types };
  }
}
