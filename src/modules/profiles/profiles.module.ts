import { Module } from '@nestjs/common';
import { ClerkModule } from '../../infrastructure/clerk/clerk.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { HomeownerProfilesController } from './homeowner-profiles.controller';
import { HomeownerProfilesService } from './homeowner-profiles.service';
import { ProfessionalProfilesController } from './professional-profiles.controller';
import { ProfessionalProfilesService } from './professional-profiles.service';

@Module({
  imports: [ClerkModule, RedisModule],
  controllers: [HomeownerProfilesController, ProfessionalProfilesController],
  providers: [
    HomeownerProfilesService,
    ProfessionalProfilesService,
    ClerkAuthGuard,
  ],
})
export class ProfilesModule {}
