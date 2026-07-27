import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ClerkService } from '../../infrastructure/clerk/clerk.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  AccountDeactivatedException,
  UnauthenticatedException,
} from '../errors/domain.exception';

export interface AuthenticatedUser {
  id: string;
  clerkUserId: string;
  roles: string[];
}

export interface RequestWithClerkAuth extends Request {
  auth?: AuthenticatedUser;
}

/**
 * ClerkAuthGuard — Batch 2 scope.
 *
 * Verifies the Bearer session JWT via ClerkService, resolves the corresponding
 * local user record in Prisma, checks account lifecycle status, and attaches
 * the minimal authenticated user payload to `req.auth`.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly clerkService: ClerkService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClerkAuth>();
    const authHeaderValue = request.get('Authorization');
    const authHeader =
      Array.isArray(authHeaderValue) ? authHeaderValue[0] : authHeaderValue;

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedException(
        'Missing or malformed Authorization header.',
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();

    let clerkUserId: string;
    try {
      const verified = await this.clerkService.verifySessionToken(token);
      clerkUserId = verified.clerkUserId;
    } catch (err) {
      this.logger.warn(`Session token verification failed: ${err}`);
      throw new UnauthenticatedException('Invalid or expired session.');
    }

    const userRecord = await this.prisma.user.findUnique({
      where: { clerkUserId },
      select: {
        id: true,
        clerkUserId: true,
        isActive: true,
        deletedAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!userRecord) {
      throw new UnauthenticatedException('No local user found for this session.');
    }

    if (userRecord.deletedAt !== null) {
      throw new AccountDeactivatedException();
    }

    if (!userRecord.isActive) {
      throw new AccountDeactivatedException();
    }

    request.auth = {
      id: userRecord.id,
      clerkUserId: userRecord.clerkUserId,
      roles: userRecord.userRoles.map((userRole) => userRole.role.name),
    };

    return true;
  }
}
