import { Global, Module } from '@nestjs/common';
import { RedisService, redisClientFactory } from './redis.service';

@Global()
@Module({
  providers: [redisClientFactory, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
