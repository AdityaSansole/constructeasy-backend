```markdown
# Implementation Plan

Summarizes the frozen Phase 3 Backend Implementation Plan and tracks
progress against it, batch by batch. This document sequences work — it
does not alter any architecture, database, or API decision made in the
governing specification documents.

Each batch is implemented, tested, reviewed, and explicitly frozen before
the next begins. No batch starts before the preceding one is Frozen.

---

## Roadmap and Status

| Batch | Scope | Status |
|---|---|---|
| 0 | Core Infrastructure — config, logging, error handling, Prisma/Redis/S3/BullMQ/Clerk setup, health check | **Completed** |
| 1 | Locations & Lookups — `countries`, `states`, `cities`, `localities`, `locales`, `roles`, `professional_categories`, `subscription_plans` | **Completed** |
| 2 | Users & Auth — Clerk webhook, `users`/`user_roles`/`admin_users`, full `ClerkAuthGuard` resolution, `RolesGuard`, onboarding, `/me` | Not Started |
| 3 | Profiles — homeowner + professional profiles, service areas, category mapping | Not Started |
| 4 | Verification & Trust — records, documents, flags, trust scores, verification-state DB trigger | Not Started |
| 5 | Portfolio — portfolios, portfolio media | Not Started |
| 6 | Search & Discovery — browse, detail, compare (read-layer over Profiles/Portfolio/Verification) | Not Started |
| 7 | Contacts — contact lifecycle state machine | Not Started |
| 8 | Reviews — reviews, review media, review flags, rating-aggregate DB trigger | Not Started |
| 9 | Subscriptions — append-only subscription history | Not Started |
| 10 | Notifications — BullMQ consumers, SES/SMS dispatch | Not Started |
| 11 | Content & i18n — articles, translations, publish workflow | Not Started |
| 12 | Admin & Audit — dashboard, cross-module moderation, audit log, role management | Not Started |

## Batch Order Rationale

Directly derived from the frozen Database Design's migration order (a
table is never migrated before its FK dependencies exist) and the module
dependency graph — not re-derived independently per batch. Notifications
sits structurally early (queue infrastructure exists from Batch 0) but is
implemented functionally late, since its job payloads are module-specific
events that don't exist until the modules producing them (Verification,
Contacts, Reviews) are built.

## Shared Infrastructure (built once, Batch 0)

Response envelope interceptor, global exception filter, request-ID
middleware, Clerk token verification, pagination/ETag/slug/conditional-
update utilities, rate-limiting baseline, health check. Nothing in Batch
1+ re-implements any of this — a review finding duplicated infrastructure
is a Critical finding, not a style note.

## Testing Strategy

- **Unit tests** — domain/application logic, mocked Prisma, no real DB.
  Run via `npm test`.
- **Integration tests** — real Prisma client against a real Postgres
  instance; verifies constraints, FKs, and (from Batch 4/8 onward)
  triggers actually behave as designed. Run via `npm run test:integration`
  (separate Jest config — deliberately excluded from `npm test` so unit
  tests never require a database).
- **E2E tests** — full HTTP request/response per critical flow. Not yet
  populated (`test/e2e/`) — meaningful starting with Batch 2's
  authenticated flows.

Business-rule-bearing code (state machines, trigger-dependent logic,
authorization checks) is held to a higher bar than CRUD boilerplate — not
a blanket coverage percentage, a risk-weighted one.

## Definition of Done (every batch)

A batch is not Completed/Frozen until **all** of the following hold:

1. All endpoints/tables/business rules in scope trace directly to the
   frozen specification — no undocumented additions.
2. Prisma migration(s) applied cleanly; schema matches migration exactly.
3. `npx prisma generate` succeeds against a real environment.
4. `npx tsc --noEmit` passes with zero errors.
5. `npm run lint` passes with zero errors/warnings.
6. Unit tests pass for all services/utilities introduced in the batch.
7. Integration tests pass for all new DB constraints/FKs/triggers
   introduced in the batch (against a real Postgres instance).
8. E2E tests pass for the batch's primary happy-path and primary
   authorization-denial path, once auth exists (Batch 2 onward).
9. No trigger-owned field is written outside its designated DB trigger,
   once triggers exist (Batch 4 onward).
10. No shared-utility/infrastructure code is duplicated (Batch 0's
    utilities are reused, not reimplemented).
11. Rate limits and authorization guards are applied per the frozen API
    spec for every endpoint in the batch, once auth exists.
12. Batch reviewed against the governing specification documents, with
    findings resolved before being marked Completed.
13. Changes committed and pushed to the repository's default branch.

## Completed Batches — Summary

**Batch 0 (Core Infrastructure):** all Definition of Done items above
verified, including `prisma generate`, `tsc`, lint, and unit tests
passing in the actual repository (not just a development sandbox).
Committed and pushed.

**Batch 1 (Locations & Lookups):** all 8 Batch 1 Prisma models added;
migration `0001_locations_and_lookups` applied and verified; Locations
module (`countries`, `states`, `cities`, `localities`) and Lookups module
(`locales`, `roles`) implemented per API Design Batch 1 exactly; seed
script added; unit tests added for every service; integration tests added
covering every FK and unique constraint introduced in this batch. All
Definition of Done items verified in the actual repository. Committed and
pushed.

See `BATCH_STATUS.md` for the detailed, dated verification record.

## Pending Batches

Batches 2–12: not started. Batch 2 (Users & Auth) is next in sequence and
will not begin until explicitly authorized.
```
