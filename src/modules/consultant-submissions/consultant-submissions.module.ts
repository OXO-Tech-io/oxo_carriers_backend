import { Module } from '@nestjs/common';
import { ConsultantSubmissionsController } from './consultant-submissions.controller';
import { ConsultantSubmissionsService } from './consultant-submissions.service';

@Module({
  controllers: [ConsultantSubmissionsController],
  providers: [ConsultantSubmissionsService],
})
export class ConsultantSubmissionsModule {}
