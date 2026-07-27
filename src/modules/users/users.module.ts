import { Module } from '@nestjs/common';
import { ClerkModule } from '../../infrastructure/clerk/clerk.module';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { MeController } from './me.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ClerkModule],
  controllers: [MeController, UsersController],
  providers: [UsersService, ClerkAuthGuard],
})
export class UsersModule {}
