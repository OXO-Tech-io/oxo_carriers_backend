import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';

/** Global module so RolesGuard can be referenced via @UseGuards(RolesGuard) from any feature module without importing AuthModule. */
@Global()
@Module({
  providers: [RolesGuard],
  exports: [RolesGuard],
})
export class CommonModule {}
