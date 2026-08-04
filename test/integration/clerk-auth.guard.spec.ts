import { bootstrapTestApp, closeTestApp, MockClerkService } from './helpers';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ClerkAuthGuard } from '../../src/common/guards/clerk-auth.guard';
import { ClerkService } from '../../src/infrastructure/clerk/clerk.service';
import { ExecutionContext } from '@nestjs/common';

describe('ClerkAuthGuard (integration)', () => {
  let app: any;
  let prisma: PrismaService;
  let guard: ClerkAuthGuard;
  let mockClerk: MockClerkService;
  let moduleRef: any;

  beforeAll(async () => {
    const t = await bootstrapTestApp();
    app = t.app;
    prisma = t.prisma;
    moduleRef = t.moduleRef;
    mockClerk = moduleRef.get(ClerkService) as unknown as MockClerkService;
    guard = moduleRef.get(ClerkAuthGuard);
  });

  afterAll(async () => {
    await closeTestApp(app, moduleRef);
  });

  beforeEach(async () => {
    try {
      await prisma.userRole.deleteMany();
      await prisma.user.deleteMany();
    } catch {
      // ignore
    }
  });

  function makeContext(authHeader?: string): ExecutionContext {
    const req: any = { headers: {}, get: () => authHeader, header: () => authHeader };
    return ({ switchToHttp: () => ({ getRequest: () => req }) } as unknown) as ExecutionContext;
  }

  test('allows valid session and attaches auth', async () => {
    const user = await prisma.user.create({ data: { clerkUserId: 'clerk-1' } });
    mockClerk.clerkUserId = 'clerk-1';

    const ctx = makeContext('Bearer token');
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    const req = (ctx as any).switchToHttp().getRequest();
    expect(req.auth).toBeDefined();
    expect(req.auth.id).toBe(user.id);
  });

  test('rejects when no header', async () => {
    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  test('rejects deleted account', async () => {
    await prisma.user.create({ data: { clerkUserId: 'clerk-2', deletedAt: new Date() } });
    mockClerk.clerkUserId = 'clerk-2';
    const ctx = makeContext('Bearer t');
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });
});
