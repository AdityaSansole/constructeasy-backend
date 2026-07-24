import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'http';
import type { RequestWithClerkAuth } from '../../common/guards/clerk-auth.guard';

/**
 * Structured JSON logging (Pino) — Sign-Off Section 13 / Phase 3 Plan
 * Section 12. Every log line carries request_id, user_id (when available),
 * and level. No sensitive data (document contents, raw phone/email bulk
 * values, tokens) is logged — enforced via the redact list below rather
 * than per-call discipline.
 *
 * user_id is read from req.auth (Clerk identity) in Batch 0/1; from Batch 2
 * onward, req.user.id (local resolved identity) becomes available and
 * should be preferred once the Users & Auth guard extension lands.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('env') === 'production' ? 'info' : 'debug',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              '*.password',
              '*.phone',
              '*.email',
              '*.file_url',
              '*.fileUrl',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req: IncomingMessage) => {
            const r = req as RequestWithClerkAuth & { id?: string };
            return {
              request_id: r.id,
              clerk_user_id: r.auth?.clerkUserId,
            };
          },
          autoLogging: {
            ignore: (req: IncomingMessage) =>
              req.url === '/api/v1/health',
          },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggingModule {}
