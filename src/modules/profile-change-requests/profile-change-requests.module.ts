import { Module } from '@nestjs/common';
import { ProfileChangeRequestsController } from './profile-change-requests.controller';

@Module({
  controllers: [ProfileChangeRequestsController],
})
export class ProfileChangeRequestsModule {}
