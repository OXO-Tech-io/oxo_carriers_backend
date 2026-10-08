import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EmployeesModule } from '../employees/employees.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [EmployeesModule],
  providers: [
    // Applied to every route (equivalent to the old `app.use(authenticate)`
    // being mounted ahead of nearly every router); individual handlers opt
    // out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
