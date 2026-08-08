import { Module } from '@nestjs/common';
import { ClerkModule } from '../../infrastructure/clerk/clerk.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { S3Module } from '../../infrastructure/storage/s3.module';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerificationPolicyService } from './verification-policy.service';
import { VerificationLevelResolver } from './verification-level.resolver';
import { VerificationService } from './verification.service';
import { AdminVerificationService } from './admin-verification.service';
import { VerificationController } from './verification.controller';
import { AdminVerificationController } from './admin-verification.controller';

@Module({
  imports: [ClerkModule, RedisModule, S3Module],
  controllers: [VerificationController, AdminVerificationController],
  providers: [
    VerificationService,
    AdminVerificationService,
    VerificationPolicyService,
    VerificationLevelResolver,
    ClerkAuthGuard,
    RolesGuard,
  ],
  exports: [
    VerificationService,
    AdminVerificationService,
    VerificationPolicyService,
    VerificationLevelResolver,
  ],
})
export class VerificationModule {}
