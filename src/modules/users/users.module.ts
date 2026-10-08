import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ArchiveModule } from '../archive/archive.module';

@Module({
  imports: [ArchiveModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
