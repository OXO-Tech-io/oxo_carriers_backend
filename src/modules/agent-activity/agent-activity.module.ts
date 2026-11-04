import { Module } from '@nestjs/common';
import { AgentActivityController } from './agent-activity.controller';
import { AgentActivityService } from './agent-activity.service';

@Module({
  controllers: [AgentActivityController],
  providers: [AgentActivityService],
})
export class AgentActivityModule {}
