import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface PaginatedShape<T> {
  items: T[];
  meta: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
}

function isPaginatedShape(value: unknown): value is PaginatedShape<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'meta' in value
  );
}

/**
 * Wraps every successful controller return value in the frozen response
 * envelope: { success: true, data, meta }. (Sign-Off Section 7.4)
 *
 * Controllers return plain domain/DTO data (or the PaginatedShape produced
 * by the shared pagination helper — see common/dto/pagination.ts) and never
 * hand-construct the envelope themselves (Phase 3 Plan, Section 7).
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        if (isPaginatedShape(payload)) {
          return {
            success: true,
            data: payload.items,
            meta: payload.meta,
          };
        }
        return {
          success: true,
          data: payload ?? null,
        };
      }),
    );
  }
}
