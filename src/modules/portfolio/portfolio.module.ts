import { Module } from '@nestjs/common';
import { ClerkModule } from '../../infrastructure/clerk/clerk.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { S3Module } from '../../infrastructure/storage/s3.module';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { PortfolioService } from './portfolio.service';
import { PortfolioMediaService } from './portfolio-media.service';
import { PortfolioController } from './portfolio.controller';
import { PublicPortfolioController } from './public-portfolio.controller';

@Module({
  imports: [ClerkModule, RedisModule, S3Module],
  controllers: [PortfolioController, PublicPortfolioController],
  providers: [PortfolioService, PortfolioMediaService, ClerkAuthGuard],
  exports: [PortfolioService, PortfolioMediaService],
})
export class PortfolioModule {}
