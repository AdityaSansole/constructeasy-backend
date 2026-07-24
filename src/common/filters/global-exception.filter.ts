import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { DomainException } from '../errors/domain.exception';
import { ErrorCode, ERROR_CODE_HTTP_STATUS } from '../errors/error-codes';

interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details: unknown[];
  };
}

/**
 * Global exception filter — Phase 3 Plan Section 7 / 13.
 *
 * This is the ONLY place in the codebase that constructs the error envelope
 * (Sign-Off Section 7.4). Domain code throws DomainException subclasses;
 * this filter maps them (and a small set of known framework/Prisma errors)
 * to `{ success: false, error: { code, message, details } }` with the
 * correct HTTP status. Raw Prisma/Postgres errors never reach the client.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { id?: string }).id;

    const { status, envelope } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        { requestId, err: exception },
        'Unhandled exception reached the global filter',
      );
    }

    response.status(status).json(envelope);
  }

  private resolve(exception: unknown): {
    status: number;
    envelope: ErrorEnvelope;
  } {
    // 1. Our own domain exceptions — the expected, common path.
    if (exception instanceof DomainException) {
      return {
        status: ERROR_CODE_HTTP_STATUS[exception.code],
        envelope: {
          success: false,
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details ?? [],
          },
        },
      };
    }

    // 2. class-validator DTO failures surfaced as NestJS BadRequestException
    //    by the global ValidationPipe (see pipes/validation.pipe.ts).
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status === HttpStatus.BAD_REQUEST) {
        const details =
          typeof body === 'object' && body !== null && 'message' in body
            ? ([] as unknown[]).concat((body as { message: unknown }).message)
            : [];
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          envelope: {
            success: false,
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: 'One or more fields failed validation.',
              details,
            },
          },
        };
      }
      // Any other raw HttpException (e.g., thrown by a guard before a
      // domain exception exists) — pass through status, generic envelope.
      return {
        status,
        envelope: {
          success: false,
          error: {
            code: this.codeForStatus(status),
            message:
              typeof body === 'string'
                ? body
                : (body as { message?: string })?.message ?? exception.message,
            details: [],
          },
        },
      };
    }

    // 3. Prisma known errors — never leak raw DB error text to the client.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: ERROR_CODE_HTTP_STATUS[ErrorCode.CONFLICT],
          envelope: {
            success: false,
            error: {
              code: ErrorCode.CONFLICT,
              message: 'A record with these values already exists.',
              details: [],
            },
          },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: ERROR_CODE_HTTP_STATUS[ErrorCode.NOT_FOUND],
          envelope: {
            success: false,
            error: {
              code: ErrorCode.NOT_FOUND,
              message: 'Resource not found.',
              details: [],
            },
          },
        };
      }
    }

    // 4. Truly unexpected — generic 500, no internal detail leaked.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      envelope: {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
          details: [],
        },
      },
    };
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 429:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
