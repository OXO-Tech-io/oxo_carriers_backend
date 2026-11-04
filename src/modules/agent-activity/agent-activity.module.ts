import { Module } from '@nestjs/common';
import { EmployeeActivityController } from './agent-activity.controller';
import { EmployeeActivityService } from './agent-activity.service';

@Module({
  controllers: [EmployeeActivityController],
  providers: [EmployeeActivityService],
})
export class AgentActivityModule {}
