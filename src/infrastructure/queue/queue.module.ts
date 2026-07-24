import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QueueName, queueToken } from './queue.constants';
import { QueueService } from './queue.service';

/**
 * Registers one BullMQ Queue instance per QueueName, all backed by the same
 * ElastiCache Redis instance under the `queue:*` prefix convention
 * (Phase 3 Plan Section 11). Feature modules never construct a `Queue`
 * directly — they inject QueueService, which wraps these.
 */
const queueProviders: Provider[] = Object.values(QueueName).map(
  (name) => ({
    provide: queueToken(name),
    useFactory: (config: ConfigService) =>
      new Queue(name, {
        connection: {
          // BullMQ needs its own ioredis-compatible connection options
          // (not a shared client instance) so it can manage blocking
          // commands independently of RedisService's cache usage.
          host: new URL(config.get<string>('redis.url') as string).hostname,
          port: Number(
            new URL(config.get<string>('redis.url') as string).port || 6379,
          ),
        },
        prefix: 'queue',
      }),
    inject: [ConfigService],
  }),
);

@Global()
@Module({
  providers: [...queueProviders, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
