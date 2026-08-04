import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../guards/clerk-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { auth?: AuthenticatedUser }>();

    return request.auth;
  },
);
