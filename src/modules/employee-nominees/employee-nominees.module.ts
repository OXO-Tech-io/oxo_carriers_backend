import { Module } from '@nestjs/common';
import { EmployeeNomineesController } from './employee-nominees.controller';
import { EmployeeNomineesService } from './employee-nominees.service';

@Module({
  controllers: [EmployeeNomineesController],
  providers: [EmployeeNomineesService],
})
export class EmployeeNomineesModule {}
