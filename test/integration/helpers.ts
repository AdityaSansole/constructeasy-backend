import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ClerkService } from '../../src/infrastructure/clerk/clerk.service';
import { Queue } from 'bullmq';
import {
  QueueName,
  queueToken,
} from '../../src/infrastructure/queue/queue.constants';

/** Minimal env defaults so integration tests and global setup can reach Postgres/Redis. */
export function applyIntegrationTestEnvDefaults(): void {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.PORT = process.env.PORT ?? '4001';
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/constructeasy_test';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test';
  process.env.CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY ?? 'test';
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? 'test';
  process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
  process.env.S3_PUBLIC_BUCKET_NAME = process.env.S3_PUBLIC_BUCKET_NAME ?? 'test-public';
  process.env.S3_PRIVATE_BUCKET_NAME = process.env.S3_PRIVATE_BUCKET_NAME ?? 'test-private';
  process.env.RATE_LIMIT_AUTHENTICATED_PER_MIN = process.env.RATE_LIMIT_AUTHENTICATED_PER_MIN ?? '60';
  process.env.RATE_LIMIT_UNAUTHENTICATED_PER_MIN = process.env.RATE_LIMIT_UNAUTHENTICATED_PER_MIN ?? '10';
  process.env.CACHE_TTL_LOOKUP_SECONDS = process.env.CACHE_TTL_LOOKUP_SECONDS ?? '60';
  process.env.CACHE_TTL_LIST_SECONDS = process.env.CACHE_TTL_LIST_SECONDS ?? '60';
  process.env.CACHE_TTL_DASHBOARD_SECONDS = process.env.CACHE_TTL_DASHBOARD_SECONDS ?? '60';
}

export class MockClerkService {
  public lastVerifiedToken?: string;
  public webhookShouldThrow = false;
  constructor(public clerkUserId = 'test-clerk-user') {}

  async verifySessionToken(token: string) {
    this.lastVerifiedToken = token;
    return { clerkUserId: this.clerkUserId, sessionId: 'sess' };
  }

  verifyWebhookSignature() {
    if (this.webhookShouldThrow) throw new Error('invalid signature');
    return true;
  }
}

export async function bootstrapTestApp() {
  applyIntegrationTestEnvDefaults();

  const { AppModule } = await import('../../src/app.module');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClerkService)
    .useValue(new MockClerkService())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const prisma = moduleRef.get(PrismaService);
  // attempt to clean DB tables used by tests; if not available this will fail in runtime
  try {
    await prisma.$executeRaw`TRUNCATE TABLE webhook_events, user_roles, admin_users, users RESTART IDENTITY CASCADE`;
  } catch {
    // ignore if DB not available in this environment
  }

  return { app: app as INestApplication, prisma, moduleRef };
}

export async function closeTestApp(
  app: INestApplication,
  moduleRef?: any,
) {
  if (moduleRef) {
    await Promise.all(
      Object.values(QueueName).map(async (name) => {
        const token = queueToken(name as QueueName);
        try {
          const queue = moduleRef.get(token, { strict: false }) as Queue | undefined;
          if (queue && typeof queue.close === 'function') {
            await queue.close();
          }
        } catch {
          // ignore missing queue providers
        }
      }),
    );

    try {
      const prisma = moduleRef.get(PrismaService, { strict: false });
      if (prisma && typeof prisma.$disconnect === 'function') {
        await prisma.$disconnect();
      }
    } catch {
      // ignore if Prisma is already closed or unavailable
    }
  }

  if (app && typeof app.close === 'function') {
    await app.close();
  }
}

export default MockClerkService;
