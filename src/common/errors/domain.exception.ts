import { ErrorCode } from './error-codes';

/**
 * Base class for all domain-layer exceptions across every module.
 *
 * Coding standard (Phase 3 Plan, Section 17 / 13): domain and application
 * layers throw meaningful, module-specific exceptions extending this class —
 * they never construct HTTP responses or reference NestJS HTTP concerns
 * directly. The global exception filter (see filters/) is the single place
 * that translates these into the frozen response envelope.
 *
 * Example (introduced in a later batch, shown here only to document the
 * pattern — no business modules exist yet in Batch 0):
 *
 *   export class InvalidStatusTransitionException extends DomainException {
 *     constructor(from: string, to: string) {
 *       super(
 *         ErrorCode.INVALID_STATUS_TRANSITION,
 *         `Cannot transition from '${from}' to '${to}'.`,
 *       );
 *     }
 *   }
 */
export abstract class DomainException extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationException extends DomainException {
  constructor(message = 'Validation failed.', details?: unknown[]) {
    super(ErrorCode.VALIDATION_ERROR, message, details);
  }
}

export class NotFoundException extends DomainException {
  constructor(resource = 'Resource') {
    super(ErrorCode.NOT_FOUND, `${resource} not found.`);
  }
}

export class ConflictException extends DomainException {
  constructor(message = 'Conflict.') {
    super(ErrorCode.CONFLICT, message);
  }
}

export class ForbiddenException extends DomainException {
  constructor(message = 'You do not have permission to perform this action.') {
    super(ErrorCode.FORBIDDEN, message);
  }
}

export class UnauthenticatedException extends DomainException {
  constructor(message = 'Authentication required.') {
    super(ErrorCode.UNAUTHENTICATED, message);
  }
}

export class AccountDeactivatedException extends DomainException {
  constructor() {
    super(
      ErrorCode.ACCOUNT_DEACTIVATED,
      'This account has been deactivated.',
    );
  }
}
