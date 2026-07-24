import { DomainException } from '../errors/domain.exception';
import { ErrorCode } from '../errors/error-codes';

/** Thrown by assertConditionalUpdateApplied — a named, typed exception so
 * call sites and tests can catch/assert on it directly. */
export class StateConflictException extends DomainException {
  constructor(code: ErrorCode, message: string) {
    super(code, message);
  }
}

/**
 * Shared idempotency / concurrency-safety helper — Phase 3 Plan Section 7,
 * "Idempotency/concurrency helper".
 *
 * Enforces the pattern established repeatedly across API Design (verification
 * approve/reject, contact status transitions, review-flag/verification-flag
 * resolution): a state transition is always a CONDITIONAL update —
 * `WHERE id = :id AND status = :expectedCurrentStatus` — never a blind
 * overwrite (Sign-Off Section 20, Rule 3). If Prisma's `updateMany` (or
 * equivalent conditional update) affects zero rows, the record was already
 * moved by a concurrent request; this is translated to a clean 409, not a
 * silent success or a raw DB inconsistency.
 *
 * Usage (illustrative — concrete Prisma models arrive in later batches):
 *
 *   const result = await prisma.verificationRecords.updateMany({
 *     where: { id, status: 'pending' },
 *     data: { status: 'approved', reviewedBy, reviewedAt: new Date() },
 *   });
 *   assertConditionalUpdateApplied(result.count, ErrorCode.ALREADY_REVIEWED);
 */
export function assertConditionalUpdateApplied(
  affectedRowCount: number,
  code:
    | ErrorCode.ALREADY_REVIEWED
    | ErrorCode.INVALID_STATUS_TRANSITION
    | ErrorCode.CONFLICT = ErrorCode.CONFLICT,
  message = 'The resource was already modified by another request.',
): void {
  if (affectedRowCount === 0) {
    throw new StateConflictException(code, message);
  }
}
