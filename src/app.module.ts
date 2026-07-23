import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthModule } from './health/health.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { AuthMeModule } from './modules/auth/auth-me.module';
import { UsersModule } from './modules/users/users.module';
import { SalaryModule } from './modules/salary/salary.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EmployeeEducationModule } from './modules/employee-education/employee-education.module';
import { EmployeeWorkHistoryModule } from './modules/employee-work-history/employee-work-history.module';
import { EmployeeNomineesModule } from './modules/employee-nominees/employee-nominees.module';
import { EmployeeDependentsModule } from './modules/employee-dependents/employee-dependents.module';
import { EmployeeEmergencyContactsModule } from './modules/employee-emergency-contacts/employee-emergency-contacts.module';
import { EmployeeWelfareInfoModule } from './modules/employee-welfare-info/employee-welfare-info.module';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    AuthModule,
    EmployeesModule,
    HealthModule,
    VendorsModule,
    AuthMeModule,
    UsersModule,
    SalaryModule,
    ReportsModule,
    EmployeeEducationModule,
    EmployeeWorkHistoryModule,
    EmployeeNomineesModule,
    EmployeeDependentsModule,
    EmployeeEmergencyContactsModule,
    EmployeeWelfareInfoModule,
  ],
})
export class AppModule {}
