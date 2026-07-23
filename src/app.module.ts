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
import { FacilitiesModule } from './modules/facilities/facilities.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { GroupsModule } from './modules/groups/groups.module';
import { WorkLogsModule } from './modules/work-logs/work-logs.module';
import { MedicalInsuranceModule } from './modules/medical-insurance/medical-insurance.module';
import { ConsultantSubmissionsModule } from './modules/consultant-submissions/consultant-submissions.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { LeaveCalendarModule } from './modules/leave-calendar/leave-calendar.module';
import { EmployeeNotesModule } from './modules/employee-notes/employee-notes.module';
import { ProfileChangeRequestsModule } from './modules/profile-change-requests/profile-change-requests.module';
import { EmployeePiiModule } from './modules/employee-pii/employee-pii.module';

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
    FacilitiesModule,
    PermissionsModule,
    NotificationsModule,
    GroupsModule,
    WorkLogsModule,
    MedicalInsuranceModule,
    ConsultantSubmissionsModule,
    VouchersModule,
    LeaveCalendarModule,
    EmployeeNotesModule,
    ProfileChangeRequestsModule,
    EmployeePiiModule,
  ],
})
export class AppModule {}
