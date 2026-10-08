import { Module } from '@nestjs/common';
import { EmployeeDependentsController } from './employee-dependents.controller';
import { EmployeeDependentsService } from './employee-dependents.service';

@Module({
  controllers: [EmployeeDependentsController],
  providers: [EmployeeDependentsService],
})
export class EmployeeDependentsModule {}
