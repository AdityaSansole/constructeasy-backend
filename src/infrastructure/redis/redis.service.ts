import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Logical key namespaces (single Redis instance, prefix-separated) —
 * Phase 3 Plan Section 9 / Architecture Blueprint Section 11.
 * `queue:*` is reserved for BullMQ (see infrastructure/queue) and is not
 * touched directly through this service.
 */
export enum RedisNamespace {
  Cache = 'cache',
  Session = 'session',
  RateLimit = 'ratelimit',
}

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  private key(namespace: RedisNamespace, key: string): string {
    return `${namespace}:${key}`;
  }

  async get<T = string>(
    namespace: RedisNamespace,
    key: string,
  ): Promise<T | null> {
    const raw = await this.client.get(this.key(namespace, key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(
    namespace: RedisNamespace,
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    const fullKey = this.key(namespace, key);
    if (ttlSeconds) {
      await this.client.set(fullKey, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(fullKey, serialized);
    }
  }

  async del(namespace: RedisNamespace, key: string): Promise<void> {
    await this.client.del(this.key(namespace, key));
  }

  /**
   * Deletes all keys under a namespace matching a pattern — the mechanism
   * behind named invalidation utilities such as invalidateProfessionalCache
   * (implemented in the Profiles module, Batch 3, once professional_profiles
   * exists; the underlying capability lives here per Phase 3 Plan Section 9).
   */
  async invalidatePattern(
    namespace: RedisNamespace,
    pattern: string,
  ): Promise<void> {
    const fullPattern = this.key(namespace, pattern);
    const stream = this.client.scanStream({ match: fullPattern, count: 100 });
    const pipeline = this.client.pipeline();
    let found = 0;

    for await (const keys of stream) {
      for (const k of keys as string[]) {
        pipeline.del(k);
        found += 1;
      }
    }
    if (found > 0) {
      await pipeline.exec();
    }
    this.logger.debug(`Invalidated ${found} key(s) matching ${fullPattern}`);
  }

  getRawClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export const redisClientFactory = {
  provide: REDIS_CLIENT,
  useFactory: (config: ConfigService) => {
    return new Redis(config.get<string>('redis.url') as string, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  },
  inject: [ConfigService],
};
