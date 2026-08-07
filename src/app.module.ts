import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import configuration from './config/configuration';
import { validateEnvironment } from './config/validation.schema';
import { createThrottlerConfig } from './common/rate-limit/throttler.config';

import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { S3Module } from './infrastructure/storage/s3.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { ClerkModule } from './infrastructure/clerk/clerk.module';
import { AppLoggingModule } from './infrastructure/logging/logging.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';

import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

import { HealthModule } from './modules/health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { LookupsModule } from './modules/lookups/lookups.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createThrottlerConfig,
    }),
    AppLoggingModule,

    // --- Global infrastructure (Batch 0) ---
    PrismaModule,
    RedisModule,
    S3Module,
    QueueModule,
    ClerkModule,

    // --- Feature modules (Batch 1+ modules are added here incrementally) ---
    HealthModule,
    LocationsModule,
    LookupsModule,
    WebhooksModule,
    UsersModule,
    ProfilesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
