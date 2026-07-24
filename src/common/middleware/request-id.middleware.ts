import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Generates (or propagates a client-supplied) request ID, attaches it to
 * `req.id`, and returns it on every response via X-Request-ID.
 * (Sign-Off Section 13; Phase 3 Plan Section 7.)
 *
 * `req.id` is read by the Pino logging module (infrastructure/logging) so
 * every structured log line for this request carries the same ID.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && incoming.length > 0 ? incoming : uuidv4();
    req.id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
