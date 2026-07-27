import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithClerkAuth } from '../guards/clerk-auth.guard';

export const CurrentUser = createParamDecorator(
  (data: keyof RequestWithClerkAuth['auth'] | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithClerkAuth>();
    const auth = request.auth;

    if (!auth) {
      return undefined;
    }

    return data ? auth[data] : auth;
  },
);
