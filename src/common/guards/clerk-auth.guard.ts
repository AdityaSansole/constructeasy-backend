import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ClerkService, VerifiedClerkIdentity } from '../../infrastructure/clerk/clerk.service';
import { UnauthenticatedException } from '../errors/domain.exception';

export interface RequestWithClerkAuth extends Request {
  auth?: VerifiedClerkIdentity;
}

/**
 * ClerkAuthGuard — Batch 0 scope.
 *
 * Verifies the Bearer session JWT via ClerkService and attaches the raw
 * verified Clerk identity to `req.auth`. It does NOT resolve this to a
 * local `req.user` (users row + roles) — that resolution, along with the
 * ACCOUNT_DEACTIVATED check (Sign-Off Section 5), is added in Batch 2
 * (Users & Auth) once the `users`/`user_roles`/`roles` Prisma models exist.
 * This split was flagged and resolved explicitly before implementation —
 * see the Batch 0 review note.
 *
 * No protected business endpoint exists before Batch 2 (Batch 1's
 * Locations/Lookups endpoints are all public GET per API Design Batch 1),
 * so this partial guard has no functional gap in practice during Batch 0/1.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(private readonly clerkService: ClerkService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClerkAuth>();
    const authHeader = request.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedException(
        'Missing or malformed Authorization header.',
      );
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      request.auth = await this.clerkService.verifySessionToken(token);
    } catch (err) {
      this.logger.warn(`Session token verification failed: ${err}`);
      throw new UnauthenticatedException('Invalid or expired session.');
    }

    return true;
  }
}
