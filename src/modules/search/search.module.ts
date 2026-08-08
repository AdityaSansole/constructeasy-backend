import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { S3Module } from '../../infrastructure/storage/s3.module';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PublicProfessionalController } from './public-professional.controller';

@Module({
  imports: [RedisModule, S3Module],
  controllers: [SearchController, PublicProfessionalController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
