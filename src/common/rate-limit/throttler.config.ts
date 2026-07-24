import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Baseline rate-limit tiers — Sign-Off Section 11:
 * "100/min authenticated, 30/min unauthenticated, with tighter overrides
 * on OTP, profile-creation, document-upload, and review-flag endpoints."
 *
 * The baseline is configured globally here (Batch 0). Named overrides
 * (e.g., 5/min on profile creation, 10/min on document-upload URL
 * generation, 20/day on review flags) are applied per-route via
 * `@Throttle(...)` decorators in the batch that implements each endpoint —
 * not centralized here, since they're endpoint-specific business rules
 * documented in API Design, not shared infrastructure.
 *
 * Note: differentiating the 100/min-authenticated vs 30/min-unauthenticated
 * baseline by auth status requires a custom ThrottlerGuard (checking
 * `req.auth` presence) — implemented as an extension in Batch 2 once
 * ClerkAuthGuard's auth resolution exists on the request. Batch 0 registers
 * the module with the unauthenticated baseline as the global default
 * (the safer default to start from), overridden upward per-route once
 * auth-awareness lands in Batch 2.
 */
export const createThrottlerConfig = (
  config: ConfigService,
): ThrottlerModuleOptions => [
  {
    name: 'default',
    ttl: 60_000, // 1 minute, in ms
    limit: config.get<number>('rateLimit.unauthenticatedPerMin') ?? 30,
  },
];
