import { closeTestApp, bootstrapTestApp } from './helpers';
import { UsersService } from '../../src/modules/users/users.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { CompleteOnboardingDto, OnboardingRole } from '../../src/modules/users/dto/complete-onboarding.dto';

describe('UsersService (integration)', () => {
  let app: any;
  let prisma: PrismaService;
  let usersService: UsersService;
  let moduleRef: any;

  beforeAll(async () => {
    const t = await bootstrapTestApp();
    app = t.app;
    prisma = t.prisma;
    moduleRef = t.moduleRef;
    usersService = moduleRef.get(UsersService);
  });

  afterAll(async () => {
    await closeTestApp(app, moduleRef);
  });

  beforeEach(async () => {
    // clean test data
    try {
      await prisma.userRole.deleteMany();
      await prisma.webhookEvent.deleteMany();
      await prisma.adminUser.deleteMany();
      await prisma.user.deleteMany();
    } catch {
      // ignore
    }
  });

  test('successful onboarding assigns role and returns MeResponse', async () => {
    const user = await prisma.user.create({ data: { clerkUserId: 'c1', email: 'a@x.com' } });
    const role = await prisma.role.upsert({
      where: { name: OnboardingRole.HOMEOWNER },
      update: {},
      create: { name: OnboardingRole.HOMEOWNER },
    });

    const dto: CompleteOnboardingDto = { role: OnboardingRole.HOMEOWNER } as any;
    const res = await usersService.completeOnboarding(user.id, dto);

    expect(res.id).toBe(user.id);
    expect(res.roles).toContain(role.name);
  });

  test('validation failure: role not found', async () => {
    const user = await prisma.user.create({ data: { clerkUserId: 'c2' } });
    const dto: CompleteOnboardingDto = { role: 'nonexistent' as any };

    await expect(usersService.completeOnboarding(user.id, dto)).rejects.toThrow();
  });

  test('duplicate onboarding results in ConflictException', async () => {
    const user = await prisma.user.create({ data: { clerkUserId: 'c3' } });
    await prisma.role.upsert({
      where: { name: OnboardingRole.PROFESSIONAL },
      update: {},
      create: { name: OnboardingRole.PROFESSIONAL },
    });

    await usersService.completeOnboarding(user.id, { role: OnboardingRole.PROFESSIONAL } as any);
    await expect(usersService.completeOnboarding(user.id, { role: OnboardingRole.PROFESSIONAL } as any)).rejects.toThrow();
  });
});
