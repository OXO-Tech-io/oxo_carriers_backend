import { Module } from '@nestjs/common';
import { EmployeeNotesController } from './employee-notes.controller';
import { EmployeeNotesService } from './employee-notes.service';

@Module({
  controllers: [EmployeeNotesController],
  providers: [EmployeeNotesService],
})
export class EmployeeNotesModule {}
