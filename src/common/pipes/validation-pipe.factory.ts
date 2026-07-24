import { ValidationPipe } from '@nestjs/common';

/**
 * Global ValidationPipe — every request DTO across every module is
 * validated here before reaching business logic (Sign-Off Section 12).
 * Failures become NestJS BadRequestExceptions, which the global exception
 * filter (filters/global-exception.filter.ts) translates into the frozen
 * 422 VALIDATION_ERROR envelope.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true, // strip properties not declared on the DTO
    forbidNonWhitelisted: true, // reject unknown properties outright
    transform: true, // enables @Type()-based query/param coercion
    forbidUnknownValues: true,
  });
}
