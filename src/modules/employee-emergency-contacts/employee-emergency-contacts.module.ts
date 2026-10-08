import { Module } from '@nestjs/common';
import { EmployeeEmergencyContactsController } from './employee-emergency-contacts.controller';
import { EmployeeEmergencyContactsService } from './employee-emergency-contacts.service';

@Module({
  controllers: [EmployeeEmergencyContactsController],
  providers: [EmployeeEmergencyContactsService],
})
export class EmployeeEmergencyContactsModule {}
