import { Module } from '@nestjs/common';
import { EmployeePiiController } from './employee-pii.controller';

@Module({
  controllers: [EmployeePiiController],
})
export class EmployeePiiModule {}
