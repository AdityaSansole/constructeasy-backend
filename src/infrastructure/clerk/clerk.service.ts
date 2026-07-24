import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { Webhook } from 'svix';

export interface VerifiedClerkIdentity {
  clerkUserId: string;
  sessionId: string;
}

/**
 * ClerkService — Batch 0 scope only.
 *
 * Per the resolved implementation-sequencing note (see Batch 0 review):
 * this service verifies Clerk JWTs and Clerk webhook signatures — pure
 * infrastructure with no dependency on any database table. It intentionally
 * does NOT resolve a verified identity to a local `users` row; that
 * resolution is added to ClerkAuthGuard in Batch 2 (Users & Auth), once
 * the `users`/`user_roles`/`roles` Prisma models exist.
 */
@Injectable()
export class ClerkService {
  private readonly secretKey: string;
  private readonly webhookSigningSecret: string;
  public readonly client: ReturnType<typeof createClerkClient>;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('clerk.secretKey') as string;
    this.webhookSigningSecret = this.config.get<string>(
      'clerk.webhookSigningSecret',
    ) as string;
    this.client = createClerkClient({ secretKey: this.secretKey });
  }

  /**
   * Verifies a Bearer session JWT. Returns the verified Clerk identity, or
   * throws if the token is invalid/expired. Used by ClerkAuthGuard.
   */
  async verifySessionToken(token: string): Promise<VerifiedClerkIdentity> {
    const payload = await verifyToken(token, { secretKey: this.secretKey });
    return {
      clerkUserId: payload.sub,
      sessionId: (payload as { sid?: string }).sid ?? '',
    };
  }

  /**
   * Verifies a Clerk webhook request's Svix signature headers against the
   * raw request body. Used by POST /api/v1/webhooks/clerk (implemented in
   * Batch 2). Signature verification is the FIRST idempotency/authenticity
   * gate; event_id-based idempotency (webhook_events table) is the second,
   * per API Design Batch 1, amendment 2 — both required, neither alone
   * sufficient.
   */
  verifyWebhookSignature(params: {
    rawBody: Buffer | string;
    headers: Record<string, string | string[] | undefined>;
  }): unknown {
    const wh = new Webhook(this.webhookSigningSecret);
    const svixId = params.headers['svix-id'];
    const svixTimestamp = params.headers['svix-timestamp'];
    const svixSignature = params.headers['svix-signature'];

    return wh.verify(params.rawBody, {
      'svix-id': Array.isArray(svixId) ? svixId[0] : (svixId ?? ''),
      'svix-timestamp': Array.isArray(svixTimestamp)
        ? svixTimestamp[0]
        : (svixTimestamp ?? ''),
      'svix-signature': Array.isArray(svixSignature)
        ? svixSignature[0]
        : (svixSignature ?? ''),
    });
  }
}
