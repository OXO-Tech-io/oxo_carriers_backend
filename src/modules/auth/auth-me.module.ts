import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { EmployeesModule } from '../../employees/employees.module';

/**
 * Named AuthMeModule (not AuthModule) to avoid colliding with the existing
 * src/auth/auth.module.ts, which wires up the global JwtAuthGuard.
 */
@Module({
  imports: [EmployeesModule],
  controllers: [AuthController],
})
export class AuthMeModule {}
