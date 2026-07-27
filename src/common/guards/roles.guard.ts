import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithClerkAuth } from './clerk-auth.guard';
import { ForbiddenException } from '../errors/domain.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithClerkAuth>();
    const user = request.auth;

    if (!user) {
      this.logger.warn('RolesGuard called without authenticated user.');
      throw new ForbiddenException();
    }

    const hasRole = user.roles.some((role) => requiredRoles.includes(role));
    if (!hasRole) {
      this.logger.warn(
        `User ${user.clerkUserId} lacks required roles: ${requiredRoles.join(', ')}`,
      );
      throw new ForbiddenException();
    }

    return true;
  }
}
