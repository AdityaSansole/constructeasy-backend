/**
 * Standard error codes — Sign-Off Document Section 7.4.
 * Every thrown domain exception must map to exactly one of these.
 * Do not add ad hoc string codes at the controller level (Phase 3 Plan,
 * Section 13: "every documented 409/422 sub-code must be traceable to
 * exactly one custom exception class").
 */
export enum ErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED', // 401
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED', // 401
  FORBIDDEN = 'FORBIDDEN', // 403
  NOT_FOUND = 'NOT_FOUND', // 404
  VALIDATION_ERROR = 'VALIDATION_ERROR', // 422
  EDIT_WINDOW_EXPIRED = 'EDIT_WINDOW_EXPIRED', // 422
  CONFLICT = 'CONFLICT', // 409
  ALREADY_REVIEWED = 'ALREADY_REVIEWED', // 409
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION', // 409
  RATE_LIMITED = 'RATE_LIMITED', // 429
  INTERNAL_ERROR = 'INTERNAL_ERROR', // 500
}

/** Maps each error code to its frozen HTTP status. */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHENTICATED]: 401,
  [ErrorCode.ACCOUNT_DEACTIVATED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VALIDATION_ERROR]: 422,
  [ErrorCode.EDIT_WINDOW_EXPIRED]: 422,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.ALREADY_REVIEWED]: 409,
  [ErrorCode.INVALID_STATUS_TRANSITION]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
};
