import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WebhookProvider } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClerkService } from '../../infrastructure/clerk/clerk.service';
import {
  UnauthenticatedException,
  ValidationException,
} from '../../common/errors/domain.exception';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkService: ClerkService,
  ) {}

  async handleClerkWebhook(params: {
    rawBody: Buffer | string;
    headers: Record<string, string | string[] | undefined>;
  }) {
    let rawPayload: string;

    if (Buffer.isBuffer(params.rawBody)) {
      rawPayload = params.rawBody.toString('utf8');
    } else if (typeof params.rawBody === 'string') {
      rawPayload = params.rawBody;
    } else {
      throw new ValidationException('Unsupported webhook payload format.');
    }

    try {
      this.clerkService.verifyWebhookSignature({
        rawBody: params.rawBody,
        headers: params.headers,
      });
    } catch (err) {
      this.logger.warn(`Clerk webhook signature verification failed: ${err}`);
      throw new UnauthenticatedException('Invalid webhook signature.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawPayload);
    } catch (err) {
      this.logger.warn(`Failed to parse Clerk webhook body: ${err}`);
      throw new ValidationException('Invalid JSON webhook payload.');
    }

    const eventId =
      (payload as Record<string, unknown>).id ??
      (payload as Record<string, unknown>).event_id;
    const eventType =
      (payload as Record<string, unknown>).type ??
      (payload as Record<string, unknown>).event_type;

    if (typeof eventId !== 'string' || eventId.trim() === '') {
      throw new ValidationException('Missing webhook event id.');
    }

    if (typeof eventType !== 'string' || eventType.trim() === '') {
      throw new ValidationException('Missing webhook event type.');
    }

    const eventData = payload as unknown as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.webhookEvent.findUnique({
        where: { eventId: eventId as string },
      });

      if (existing) {
        return existing;
      }

      try {
        return await tx.webhookEvent.create({
          data: {
            provider: WebhookProvider.clerk,
            eventId: eventId as string,
            eventType: eventType as string,
            payload: eventData,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return tx.webhookEvent.findUnique({
            where: { eventId: eventId as string },
          });
        }
        throw err;
      }
    });
  }
}
