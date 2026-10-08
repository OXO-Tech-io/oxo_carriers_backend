import { Injectable } from '@nestjs/common';
import { leaveService } from '../leaves/leave.service';

/** Thin wrapper around the existing `leaveService.getLeaveTypes` (src/modules/leaves/leave.service.ts) - reused as-is. */
@Injectable()
export class LeaveTypesService {
  async getLeaveTypes() {
    return leaveService.getLeaveTypes();
  }
}
