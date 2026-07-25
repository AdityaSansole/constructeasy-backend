```markdown
# Architecture

This document describes the backend as implemented and verified through
**Batch 1 (Locations & Lookups)** of the frozen Phase 3 Implementation
Plan. It reflects committed, tested, and pushed code only — not the full
target architecture. See the governing Phase 2 Sign-Off Document
(maintained outside this repository) for the complete frozen
specification this codebase is being built toward, and
`IMPLEMENTATION_PLAN.md` for how remaining batches extend this
incrementally.

---

## 1. Overall Backend Architecture

**Pattern:** Modular monolith, NestJS, TypeScript. One deployable service,
internally organized into strictly separated feature modules. Global,
cross-cutting concerns (error handling, response shape, request tracing,
caching, storage, queueing, auth-token verification) are implemented once
as shared infrastructure in Batch 0 and consumed by every feature module
— no feature module re-implements any of it.

**Design intent (per the governing architecture blueprint):** the module
boundaries are kept clean enough that individual modules could be
extracted into standalone services later if independent scaling or
ownership is ever justified — but no such extraction has happened, or is
needed, at this stage.

---

## 2. Folder Structure (current)

```
src/
  main.ts
  app.module.ts

  config/
    configuration.ts          # typed config loader
    validation.schema.ts      # fail-fast env validation

  common/
    filters/
      global-exception.filter.ts
    interceptors/
      response-envelope.interceptor.ts
    guards/
      clerk-auth.guard.ts     # token verification only — see Section 9
    decorators/
      roles.decorator.ts      # metadata-only, no DB dependency yet
    dto/
      pagination.dto.ts
    pipes/
      validation-pipe.factory.ts
    rate-limit/
      throttler.config.ts
    middleware/
      request-id.middleware.ts
    errors/
      error-codes.ts
      domain.exception.ts
    utils/
      etag.util.ts
      slug.util.ts
      conditional-update.util.ts

  infrastructure/
    prisma/
      prisma.module.ts
      prisma.service.ts
    redis/
      redis.module.ts
      redis.service.ts
    storage/
      s3.module.ts
      s3.service.ts
    queue/
      queue.module.ts
      queue.service.ts
      queue.constants.ts
    clerk/
      clerk.module.ts
      clerk.service.ts
    logging/
      logging.module.ts

  modules/
    health/
      health.module.ts
      health.controller.ts
    locations/
      countries/
      states/
      cities/
      localities/
      locations.module.ts
    lookups/
      locales/
      roles/
      lookups.module.ts

prisma/
  schema.prisma
  migrations/
    0001_locations_and_lookups/
  seed.ts

test/
  unit/          # mocked-Prisma unit tests, run via `npm test`
  integration/    # real-Postgres tests, run via `npm run test:integration`
  e2e/            # not yet populated — no e2e tests exist through Batch 1
```

Each `modules/*` subfolder follows a flat controller/service pattern at
this stage (appropriate for simple, largely read-only lookup/reference
data). The full domain/application/infrastructure/interface Clean
Architecture layering specified for business-logic-bearing modules
applies starting with Batch 2 (Users & Auth) and beyond, where real
business rules and state machines exist to separate.

---

## 3. Technology Stack (as configured through Batch 1)

| Layer | Choice | Status |
|---|---|---|
| Backend framework | NestJS, TypeScript | Implemented |
| Database | PostgreSQL, via Prisma ORM | Implemented (schema: 8 Batch 1 models) |
| Cache / sessions / rate-limiting | Redis | Infrastructure implemented; feature usage begins later batches |
| Object storage | AWS S3 (pre-signed URLs only) | Infrastructure implemented; no feature uses it yet |
| Job queue | BullMQ (Redis-backed) | Infrastructure implemented; no producers/consumers yet |
| Auth provider | Clerk | Token/webhook signature verification implemented; full identity resolution is Batch 2 |
| Logging | Pino, structured JSON | Implemented |
| Validation | class-validator / class-transformer | Implemented |
| Rate limiting | @nestjs/throttler | Baseline implemented |

---

## 4. Request Flow

```
Client
  │  HTTPS request, Authorization: Bearer <token> (if authenticated)
  ▼
Request-ID middleware        — assigns/propagates X-Request-ID
  ▼
Helmet + CORS                — set in main.ts
  ▼
Global ValidationPipe        — DTO validation, whitelist enforced
  ▼
Global ThrottlerGuard        — baseline rate limit
  ▼
[Route guards, where present] — e.g. ClerkAuthGuard (token verification only, see Section 9)
  ▼
Controller                   — thin, HTTP <-> service translation only
  ▼
Service                      — business/query logic, calls PrismaService
  ▼
PrismaService -> PostgreSQL
  ▼
Response
  │
  ├─ success → ResponseEnvelopeInterceptor wraps as { success: true, data, meta? }
  └─ error   → GlobalExceptionFilter wraps as { success: false, error: { code, message, details } }
```

Every response, success or error, carries `X-Request-ID`. Every log line
for a request carries the same ID via Pino's `customProps` hook.

---

## 5. Module Responsibilities

| Module | Responsibility | Status |
|---|---|---|
| `health` | `GET /api/v1/health` — DB connectivity check for load balancer health checks | Implemented |
| `locations` | Country / state / city / locality lookup endpoints, `is_active`-gated city visibility | Implemented |
| `lookups` | Locale and (public-role-filtered) role lookup endpoints | Implemented |

No business-logic module (Profiles, Verification, Portfolio, Search,
Contacts, Reviews, Subscriptions, Notifications, Content, Admin) exists
yet — all are Batch 2+.

---

## 6. Error Handling

Single global exception filter (`GlobalExceptionFilter`) is the only
place in the codebase that constructs an HTTP error response. It handles,
in order:

1. **Domain exceptions** (`DomainException` subclasses in
   `common/errors/domain.exception.ts`) — the expected, common path.
   Mapped via a fixed `ErrorCode` enum to both an HTTP status and a
   response `code` string (`common/errors/error-codes.ts`).
2. **NestJS `HttpException`** — e.g., `class-validator` failures
   surfaced by the global `ValidationPipe` become `422 VALIDATION_ERROR`.
3. **Known Prisma errors** (`PrismaClientKnownRequestError`) — unique
   constraint violations (`P2002`) become `409 CONFLICT`; not-found
   (`P2025`) becomes `404 NOT_FOUND`. Raw Prisma/Postgres error text
   never reaches the client.
4. **Anything else** — generic `500 INTERNAL_ERROR`, no internal detail
   leaked, logged server-side with full context.

Currently implemented domain exceptions: `ValidationException`,
`NotFoundException`, `ConflictException`, `ForbiddenException`,
`UnauthenticatedException`, `AccountDeactivatedException`, and
`StateConflictException` (concurrency-safe state-transition helper,
`common/utils/conditional-update.util.ts` — not yet used by any module,
since no state machine exists before Batch 2+).

---

## 7. Database Architecture

- **ORM:** Prisma, one `schema.prisma`, incrementally extended per batch
  (not one upfront migration) — migrations are hand-authored SQL files
  matched field-for-field against the schema, verified via
  `prisma generate` / `prisma migrate deploy` against a real Postgres
  instance before being treated as canonical.
- **Models implemented (Batch 1, 8 tables):** `Country`, `State`, `City`,
  `Locality`, `Locale`, `Role`, `SubscriptionPlan`,
  `ProfessionalCategory`.
- **Multi-city readiness:** `City.isActive` defaults `false` — this is
  the schema-level enforcement point for "win one city before expanding":
  a city is invisible to all public location endpoints until explicitly
  activated.
- **Public endpoint scope note:** `ProfessionalCategory` and
  `SubscriptionPlan` tables exist now (for future FK availability) but
  have no API endpoints yet — their public endpoints belong to later API
  batches (Search & Discovery; Subscriptions), even though their tables
  were created in Batch 1's migration.
- **Migration:** `prisma/migrations/0001_locations_and_lookups/` —
  verified passing `prisma generate` and TypeScript compilation against
  the generated client in the actual repository (see
  `BATCH_STATUS.md`).
- **Seed data:** `prisma/seed.ts` — idempotent (upsert-based); seeds one
  country, one state, one representative pilot city (Pune, used as a
  development placeholder — the actual pilot city is a business decision
  outside this codebase's scope), two localities, all five roles, three
  locales, four professional categories, and two subscription plans.
  Never seeds fake users or professionals.

---

## 8. Caching Strategy (infrastructure only — no feature usage yet)

Redis is wired (`infrastructure/redis/`) with namespaced key prefixes
(`cache:*`, `session:*`, `ratelimit:*`) and a pattern-based invalidation
utility. No module currently caches anything through it except the
`ETag`/`If-None-Match` mechanism (`common/utils/etag.util.ts`), which is
applied at the controller level to `GET /countries` and `GET /locales` —
both public, rarely-changing lookups.

---

## 9. Authentication — Batch 2, Pending

**Status: not yet functional. This is a deliberate, documented gap, not
an oversight.**

`ClerkAuthGuard` (`common/guards/clerk-auth.guard.ts`) currently:
- Verifies a Bearer session JWT via `ClerkService.verifySessionToken()`.
- Attaches the raw verified Clerk identity to `req.auth`.
- Does **not** resolve this to a local `users` row or roles — no `users`,
  `user_roles`, or `admin_users` table exists yet.

No endpoint in the repository currently applies `ClerkAuthGuard` — every
Batch 1 endpoint (`countries`, `states`, `cities`, `localities`,
`locales`, `roles`) is intentionally public, per the frozen API design.
`RolesGuard` and the `@CurrentUser()` self-scoping decorator referenced
by the implementation plan do not exist yet; they require
`req.user.roles`, which requires the `users`/`user_roles`/`roles`
resolution added in Batch 2.

**What Batch 2 adds here:** the Clerk webhook handler
(`POST /api/v1/webhooks/clerk`) with `webhook_events`-based idempotency,
the `users`/`user_roles`/`admin_users` Prisma models, the extension of
`ClerkAuthGuard` to resolve `req.user` (including the
`ACCOUNT_DEACTIVATED` check), a functional `RolesGuard`, and the
onboarding/`/me` endpoints.
```
