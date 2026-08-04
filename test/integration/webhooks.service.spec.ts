import { bootstrapTestApp, closeTestApp } from './helpers';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { ClerkService } from '../../src/infrastructure/clerk/clerk.service';

describe('WebhooksService (integration)', () => {
  let app: any;
  let prisma: PrismaService;
  let moduleRef: any;

  beforeAll(async () => {
    const t = await bootstrapTestApp();
    app = t.app;
    prisma = t.prisma;
    moduleRef = t.moduleRef;
  });

  afterAll(async () => {
    await closeTestApp(app, moduleRef);
  });

  beforeEach(async () => {
    try {
      await prisma.webhookEvent.deleteMany();
    } catch {
      // ignore
    }
  });

  test('stores valid webhook and is idempotent', async () => {
    const svc = moduleRef.get(WebhooksService);
    const payload = { id: 'evt-1', type: 'user.created', data: { foo: 'bar' } };
    const raw = JSON.stringify(payload);

    const event = await svc.handleClerkWebhook({ rawBody: raw, headers: {} });
    expect(event.eventId).toBe('evt-1');

    const second = await svc.handleClerkWebhook({ rawBody: raw, headers: {} });
    expect(second.eventId).toBe('evt-1');
  });

  test('rejects invalid signature', async () => {
    const mock = moduleRef.get(ClerkService) as unknown as any;
    mock.webhookShouldThrow = true;
    const svc = moduleRef.get(WebhooksService);
    const payload = { id: 'evt-2', type: 'user.updated' };
    const raw = JSON.stringify(payload);
    await expect(svc.handleClerkWebhook({ rawBody: raw, headers: {} })).rejects.toThrow();
    mock.webhookShouldThrow = false;
  });
});
