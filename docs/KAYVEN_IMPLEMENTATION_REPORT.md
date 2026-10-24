# Kayven Implementation Report

Implementation date: 2026-10-17

## Overall status

**FAIL — the full product definition of done is not met.** The navigation/Quick Log foundations and server-side Coach quota path are
implemented. Provider-backed checkout, a seven-day trial, cancellation,
payment history, and legal/business review remain incomplete. Purchase buttons
are intentionally disabled rather than letting customers pay through links
that Kayven cannot reliably associate with their account and subscription.
The current-state audit now records the post-change repository state; the
baseline section below is historical.

## Baseline audit summary

The existing application is a Next.js 14 App Router product with Supabase
authentication and data-backed nutrition, hydration, weight, supplements,
workout, progress, and coaching features. It includes RevenueCat subscription
synchronization and separate legacy Razorpay configuration, but they do not
form one verified checkout-to-entitlement flow. The current-state audit and
its explicitly labeled historical baseline are in
[`KAYVEN_CURRENT_STATE_AUDIT.md`](./KAYVEN_CURRENT_STATE_AUDIT.md).

## Stage log

### Stage A — Audit and baseline: PASS

- Recorded existing architecture, integrations, gaps, risks, and sequence in
  [`KAYVEN_CURRENT_STATE_AUDIT.md`](./KAYVEN_CURRENT_STATE_AUDIT.md).
- Baseline `npx tsc --noEmit`: PASS.
- Baseline `npm run lint`: PASS with 17 existing warnings.
- Baseline `npm run build`: PASS; Next.js skips lint and type validation in the
  production build.
- At baseline, no configured test runner or `npm test` script was present; a lightweight runner was added during verification.

### Stage B — Navigation and account routing: PASS (implementation)

- Replaced the old Home | Nutrition | Workout | Weight | Account bar with Home |
  Nutrition | + | Workout | Plans.
- The dashboard avatar already routed to `/profile`; that existing behavior
  was preserved.
- Changed Account → Subscription to `/subscription/manage`; Plans remains
  `/subscription`.
- Existing progress screens remain reachable from the dashboard and account.
- Browser snapshot confirmed all five navigation controls. Authentication-
  gated destination flows were not exercised with a signed-in test account.

### Stage C — Quick Log: PASS (screen wiring); persistence NOT VERIFIED

- Quick Log is an accessible responsive sheet/dialog with Food / Meal,
  Workout, Water, Supplement, Weight, and Sleep actions.
- The first five actions route to existing logging workflows. Sleep now has a
  minimal real Supabase-backed log screen with recent history, validation,
  loading, success, and error states.
- Food, water, supplement, weight, and workout save paths now check Supabase
  write results before reporting success or updating local totals/history.
  Failed writes show an error and preserve the user's retry path; sleep history
  updates directly from the inserted row so a subsequent history reload cannot
  misreport a successful save.
- Added an ownership-protected `sleep_logs` table, index, and RLS policy in
  [`20261017000000_sleep_logs.sql`](../supabase/migrations/20261017000000_sleep_logs.sql)
  and the fresh-install schema.
- Browser QA confirmed the six actions, opening/closing with Escape, and no
  horizontal overflow at the integrated browser's mobile-size emulation. The
  sleep migration was not applied to a Supabase database and no signed-in
  logging/persistence flow was tested. The write guards were validated by
  code/build checks, not by a live Supabase failure-injection test.

### Stage D — Plans and entitlements: PARTIAL

- Plans now includes the Free plan and only plans marked active in the central
  plan configuration (plus an inactive plan if it is the signed-in user's
  current plan).
- Feature lists come from centralized entitlements and AI limits rather than
  manually duplicated plan copy. Plan prices and discounts now come from one
  canonical plan configuration, preserving existing price values and active
  flags.
- Paid checkout buttons are disabled. Hosted Razorpay URLs were removed from
  the plan config because they are not reliably correlated with a Kayven user.
  The Razorpay order, verification, and webhook endpoints return `410 Gone`.
- The AI Coach no longer checks a constant zero usage count. A trusted
  server-side path reserves quota before paid AI work. The original atomic
  usage RPC is supplemented by reservation IDs and idempotent commit/release
  RPCs, so duplicate release calls cannot decrement unrelated requests.
- Subscription and quota storage failures fail closed before external AI work;
  if cleanup fails after generation, the error is logged and the reservation
  remains charged rather than incorrectly restoring quota.
- Per the approved strict-expiry policy, active subscriptions with an invalid
  or elapsed `current_period_end` resolve to Free. A scheduled cancellation
  retains access only until its recorded period end.
- Added service-role-only functions in
  [`20261017001000_atomic_ai_usage.sql`](../supabase/migrations/20261017001000_atomic_ai_usage.sql)
  and
  [`20261017002000_idempotent_ai_usage_reservations.sql`](../supabase/migrations/20261017002000_idempotent_ai_usage_reservations.sql),
  and mirrored the final schema in `supabase-schema.sql`. Neither migration
  has been applied or exercised against Supabase; the server-side service-role
  key is required.

### Stage E — Trial and checkout: FAIL / NOT IMPLEMENTED

- No seven-day trial was added. The repository does not establish provider
  trial configuration, payment-method requirements, eligibility, billing
  start date, or agreed post-trial terms.
- Trial eligibility remains false for every plan. RevenueCat product mapping
  still covers only the existing legacy Premium/Pro product IDs; neither
  active paid plan has a verified checkout mapping.
- No payment attempt was made; no provider sandbox credentials or supported
  test transaction were used.

### Stage F — Subscription management: FAIL / INCOMPLETE

- Account now links to `/subscription/manage`. Subscription status remains
  server-derived. No provider management URL is exposed by the API, so the
  page does not offer a fake portal/cancellation action. Refresh errors are
  surfaced instead of being silently ignored.
- In-app plan change, cancellation confirmation, and provider-backed payment
  history are not implemented. The current app does not have the verified
  provider capabilities/data needed to advertise these actions.

### Stage G — Legal and billing disclosures: PARTIAL / NOT VERIFIED

- Plans points to the existing Account > About Terms/Privacy copy and does not add
  refund, renewal, or cancellation terms.
- Existing inline Terms and Privacy copy remains in Account. It has not been
  validated against company/legal source material; dedicated refund and
  subscription-cancellation documents and consent records remain missing.
- Founder/legal review is required before publishing company, billing,
  cancellation, refund, or medical claims.

### Stage H — Visual refinement: PARTIAL

- Updated navigation and Quick Log surfaces follow existing Kayven theme
  tokens, include safe-area spacing, keyboard dismissal/focus handling, and
  reduced-motion support.
- Plans cards now avoid badge/title collision, wrap at narrow widths, and no
  longer show the previous overflowing legal-link row.
- Local browser QA rendered the Free/Basic/Standard plan cards, verified that
  checkout buttons were disabled, switched to yearly prices, and opened
  Quick Log with all six actions. A synthetic Escape keydown closed the
  dialog. The browser reported an effective CSS viewport of 312px after a
  requested 390px viewport, so this does **not** certify a 390 × 844 view.
  Tablet/desktop, full assistive-technology, and signed-in flows remain NOT
  VERIFIED.

### Stage I — Quality and regression: PARTIAL

- `npx tsc --noEmit --incremental false`: PASS.
- `npm run lint`: PASS with 17 React hook/ref warnings; the BottomNav ref
  warning introduced during this work was removed.
- `npm run build`: PASS; Next.js explicitly skips lint/type validation during
  build.
- `npm test`: PASS. A lightweight committed runner compiles and executes the
  billing and RevenueCat checks using the existing TypeScript dependency; no
  test framework or dependency was added. Tests cover plan pricing/entitlements,
  subscription expiry/cancellation boundaries, entitlement-check isolation,
  AI reservation RPC request/response wiring, and webhook normalization.
  SQL concurrency/idempotency still requires a Supabase test database.
- Browser: plan page and Quick Log actions verified; the browser had no
  signed-in Supabase session, so authenticated logging, subscription
  refresh, quota consumption, and persistence were not tested.
- Production-server smoke requests confirmed that the legacy Razorpay order,
  payment-verification, and webhook endpoints each return `410 Gone`.
- Browser console reported a blocked local Vercel Analytics script under the
  current CSP and a pre-existing `data-theme` hydration warning.

## Architecture decisions

- Supabase remains the application data store. No provider is designated the
  system of record for new sales. RevenueCat's verified mirror is retained for
  mapped legacy products; new checkout is disabled. Existing price values and
  availability flags were preserved in the canonical plan configuration.
- No provider or commercial mapping was silently changed. The decision needed
  before checkout can be implemented is recorded under “Founder decisions.”
- Prices, availability, trial eligibility, feature entitlements, and AI
  request caps are centralized in `src/lib/billing/plans.ts`;
  `src/lib/billing/entitlements.ts` resolves access/status semantics.
- AI quota reservations use a service-role-only RPC so a browser-authenticated
  user cannot call the RPC with an unlimited or inflated limit. The API
  derives the effective plan from verified subscription state first.
- Schema work is additive. Do not rerun the complete schema against an
  existing production database without reviewing its current state.

## Database and security

- Added `sleep_logs` with user ownership, positive duration, a valid timestamp
  ordering constraint, an index, and RLS.
- The original `consume_ai_usage` and `release_ai_usage` functions are revoked
  from client roles and service role after the new reservation flow is
  installed. The service-role-only `reserve_ai_usage` RPC increments usage and
  records a unique reservation atomically; `commit_ai_usage_reservation` and
  `release_ai_usage_reservation` are idempotent by reservation ID.
- AI usage is reserved before external generation, committed after provider
  usage, or released when generation does not use the provider. Cleanup errors
  are logged; a reservation that cannot be safely released remains charged.
- `supabase-schema.sql` mirrors the final reservation table and RPCs.
  Neither the sleep migration nor either AI quota migration was applied to a
  database during this work.
- Migration application, live RLS behavior, RPC grants, webhook delivery, and
  provider ownership were not tested against an external database/provider.
- Quick Log destination handlers now surface failed food, water, supplement,
  weight, and workout writes rather than treating returned Supabase errors as
  successful logging; authenticated success/failure behavior still needs
  verification against a test database.

## Final readiness verification

### Security review

The required read-only security review reported no high-confidence
vulnerabilities in the reviewed changes. Deployment configuration, database
state, provider behavior, and unreviewed product code were not certified.

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|

RevenueCat refund/reversal event semantics were not verified against provider
documentation or a configured test account. The current webhook event allowlist
is unchanged; refund-driven access changes remain unresolved and must not be
inferred from cancellation/expiration behavior.

### Validation results

| Check | Result | Scope / notes |
|---|---|---|
| `npm test` | PASS | Local billing and RevenueCat contract checks; no live DB/provider calls. |
| `npx tsc --noEmit --incremental false` | PASS | Full-project typecheck. |
| `npm run lint` | PASS with 17 warnings | Existing React hook/ref dependency warnings remain; no lint errors. |
| `npm run build` | PASS | Production build; Next.js build does not run lint/type validation. |
| `git diff --check` | PASS | Whitespace check. |
| Browser smoke | Prior pass, limited | Unsigned local plan/Quick Log smoke; no signed-in persistence. Effective viewport was 312px, not a verified 390px. |
| Supabase migrations/RPC concurrency | NOT RUN | No live or staging DB access; no migration applied. |
| Payment / provider lifecycle | NOT RUN | Checkout remains disabled; no payments attempted. |

### Prioritized remaining work

- **P0 — Verify deployment prerequisites:** apply the additive sleep and AI
  quota migrations in a non-production Supabase project; confirm RLS, grants,
  atomic quota caps, idempotent reservation release, and server-only
  `SUPABASE_SERVICE_ROLE_KEY` configuration before relying on AI quota.
- **P1 — Approve billing contract:** choose the provider and supply verified
  product/entitlement IDs, ownership mapping, trial terms, refund and
  cancellation semantics, legal terms, and payment-history capabilities.
  Keep checkout disabled until end-to-end activation and user isolation pass.
- **P2 — Close operational verification gaps:** run signed-in UI/persistence
  QA at the requested mobile and desktop viewports, verify webhook duplicate
  delivery and lifecycle transitions in a provider test environment, and
  establish a trusted per-minute AI abuse-control strategy.
- **P3 — Resolve polish and policy work:** validate legal copy with the
  business owner, fix or explicitly accept the existing CSP analytics and
  theme hydration warnings, and expand coverage for live integration/browser
  behavior.

**Recommended next step:** validate the sleep and AI quota migrations plus the
reservation RPC lifecycle against an isolated Supabase project, without enabling
checkout or touching production.

## Staging database verification (2026-10-17)

**Status: BLOCKED — no migration was applied and no database behavior was
verified.** No isolated staging environment exists, so Phase 3 was not run.

### Environment evidence

- Available: Supabase CLI 2.121.0 (authenticated; lists three org projects).
  Missing: Docker (no local Supabase stack), `psql`, `pg_ctl`.
- `.env.local` (git-ignored) points `NEXT_PUBLIC_SUPABASE_URL` at the hosted
  project named **Kayven**, which is the app's only project and also holds
  the server `SUPABASE_SERVICE_ROLE_KEY`. The other projects (`kayven-website`,
  `Outreach`) are unrelated or inactive. There is no staging/branch project,
  no `supabase/config.toml`, and the CLI is not linked.
- The configured target therefore cannot be shown to be isolated and must be
  treated as production. Per the safety rules, no migration, RPC, or test
  data was sent to it. No secret values were printed or recorded here.

### Static migration review (VERIFIED by reading/diffing only)

- Ordering: `…000000_sleep_logs` → `…001000_atomic_ai_usage` →
  `…002000_idempotent_ai_usage_reservations`. Migration 3 revokes the
  functions from migration 2, so it fails loudly if applied out of order.
- Schema parity: scripted comparison shows the three reservation functions,
  the two original quota functions, and the `sleep_logs` definition in
  `supabase-schema.sql` are textually identical to the migrations.
- Authorization: every quota RPC is `SECURITY DEFINER`, pins
  `search_path = public`, checks `auth.role() = 'service_role'`, and has
  `EXECUTE` revoked from `public`, `anon`, and `authenticated`.
  `ai_usage_reservations` has RLS enabled with no policies and table
  privileges revoked from client roles. RLS was not disabled or weakened.
  The old `consume_ai_usage`/`release_ai_usage` are revoked from every role.
- Accounting (by reasoning): reserve increments atomically with a
  conditional `ON CONFLICT` and a unique reservation row; release flips
  `reserved → released` once and decrements the reservation's own
  `(user, period)`; release-after-commit and commit-after-release both return
  `false` without changing counts; repeated calls are no-ops.
- Application server-only use: `supabase-admin`, `billing/server`, and
  `billing/sync` are imported by no `"use client"` file.

### Static findings and severity

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **High (blocker)** | Migrations, RPC grants, concurrency, and idempotency are unexecuted; behavior of the PL/pgSQL (e.g. OUT-parameter name clashes with `request_count`/`reservation_id`) is unproven. | Needs isolated Postgres |
| 2 | **High** | Deployment order: new app code requires migration 3; old app code calling `release_ai_usage` fails closed after migration 3 revokes it. Apply migrations before deploying; there is no down migration. | Documented |
| 3 | **Medium** | Other external-AI routes (`insights`, `suggestions`, `ai-scan`, `meal-plan`) do not reserve quota (`insights` only checks an entitlement). Only the Coach route is quota-enforced. | Not changed; needs product decision |
| 4 | **Medium** | A process crash/timeout between reserve and commit/release leaves a `reserved` row counted against the user, with no reaper. This fails closed (never grants extra use). | Open |
| 5 | **Low** | Provider success with empty text releases the reservation although provider cost was incurred. | Accepted |
| 6 | **Low** | Authorization uses `auth.role()`, which Supabase may deprecate; confirm it exists on the target. Direct `postgres` sessions are denied by design. | Verify on staging |

### Application integration review (VERIFIED by code reading and unit tests)

- Coach route: quota is reserved before `generateKayvenAIResponse`; a denied
  or failed reservation returns 429/503 before any provider call. Success
  (`usedAI === true`) commits; null/empty/thrown generation releases in a
  `finally`. Cleanup errors are logged and keep the reservation charged.
  `generateKayvenAIResponse` catches provider errors and returns `null`, so
  failures take the release path. Deterministic and local responses never
  reserve.
- `requireEntitlement` reads only the subscription and no longer touches AI
  usage (covered by a test that fails if `ai_usage` is queried).
- Added unit tests for reservation RPC errors, missing admin client,
  malformed results, denied reservations returning no ID, cleanup errors,
  and rejected commit/release returning `false`.

### Validation after this pass

| Check | Result |
|---|---|
| `npm test` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run lint` | PASS, 17 existing warnings, 0 errors |
| `npm run build` | PASS |
| `git diff --check` | PASS |

### Verified vs. unverified

- **Verified:** static migration ordering and schema parity; grant/RLS
  intent; Coach route control flow; client-side RPC contract handling via
  mocks; local typecheck/lint/build/tests.
- **NOT verified (not run):** migration application; function signatures in a
  live database; concurrent reservations; duplicate/double commit and release;
  quota exhaustion in SQL; cross-user isolation; unauthorized-role denial;
  rollback/cleanup; any behavior of the real `SUPABASE_SERVICE_ROLE_KEY` path.

### Exact steps to unblock

1. Create a disposable Supabase project (or Supabase branch) named for
   staging, or run `supabase init && supabase start` with Docker installed.
2. Put its URL, anon key, and service-role key in a **separate, git-ignored**
   env file (not `.env.local`); confirm the project ref differs from
   `Kayven`.
3. Provision base tables (`profiles`, `subscriptions`, `ai_usage`) from
   `supabase-schema.sql`, then apply the three migrations in order
   (`supabase db push` against the linked staging ref only).
4. Create two disposable auth users, then run these as service role: N
   parallel `reserve_ai_usage` calls with limit L (expect exactly L allowed);
   double commit/double release; release-after-commit and commit-after-release;
   cross-user counts; the same RPCs as `anon` and `authenticated` (expect
   permission denied); and failure injection by raising inside a transaction.
5. Delete the test users (cascades to usage and reservations) and drop the
   staging project if disposable.

**Safest next action:** provision the isolated staging project or local
Docker stack above; do not run any migration against the `Kayven` project
until staging results are recorded.

## Key files changed

- `docs/KAYVEN_IMPLEMENTATION_REPORT.md`
- `src/lib/billing/README.md`
- `src/lib/billing/plans.ts`, `entitlements.ts`, `server.ts`,
  `razorpay-config.ts`, `sync.ts`, `revenuecat.ts`,
  `revenuecat-config.ts`, `revenuecat-client.ts`, and
  `revenuecat-webhook.ts`
- `src/app/api/coach/route.ts`, subscription APIs, and disabled Razorpay
  order/verification/webhook endpoints
- `src/app/subscription/page.tsx` and `src/app/subscription/manage/page.tsx`
- `src/components/SubscriptionStatusCard.tsx` and
  `src/components/UpgradePrompt.tsx`
- `src/components/BottomNav.tsx`
- `src/app/log/page.tsx`, `sleep/page.tsx`, `water/page.tsx`,
  `weight/page.tsx`, `supplements/page.tsx`, and
  `workout/active/page.tsx`
- `src/app/profile/page.tsx` and `src/app/insights/page.tsx`
- `src/lib/billing/billing.test.ts`, `src/lib/billing/run-tests.cjs`, and `src/lib/billing/README.md`
- `package.json` (`npm test` script)
- `supabase-schema.sql`
- The sleep, atomic AI usage, and idempotent reservation migrations in `supabase/migrations/`

## Founder decisions and next steps

1. Choose the subscription system of record for new sales:
   - keep Razorpay and provide account-linkable subscription identifiers and a
     verified user-to-provider mapping; or
   - use RevenueCat and provide the actual product IDs, entitlements, and
     approved prices for each active plan.
2. Confirm whether the seven-day trial is approved and supply its exact
   provider configuration, eligibility rules, payment-method requirement,
   initial charge, renewal amount/interval, cancellation cutoff, and terms.
3. Confirm which plans are commercially active. The current central
   configuration keeps Basic/Standard active and Premium/Pro inactive, as
   previously configured. Confirm whether these flags and prices are still
   approved before enabling a checkout.
4. Provide verified legal entity/contact details and approve Terms, Privacy,
   subscription/billing terms, cancellation/refund terms, and medical
   disclosures.
5. Apply and verify the sleep and both AI quota migrations in a non-production
   Supabase environment; ensure `SUPABASE_SERVICE_ROLE_KEY` is configured only
   on the server.
6. Extend the local `npm test` suite with provider/database integration tests
   for webhook duplicates, trial eligibility, cancellation/expiry/refund
   semantics, user-to-user isolation, and simultaneous quota requests.
7. Repeat browser QA at the exact 390 × 844, 430 × 932, tablet, and desktop
   CSS viewports using signed-in test accounts, then make checkout available
   only after provider-confirmed subscription activation is demonstrated.

## Complete AI quota coverage

### Decision (approved by owner): shared pool
Coach, insights, suggestions, ai-scan and meal-plan all draw 1 request per provider call from the existing monthly `ai_coach` allowance (Free 10, Basic/Standard/Premium 100, Pro 300). No limits or prices were changed.
**Warning:** the dashboard auto-calls `/api/suggestions` when logs exist, so Free users can exhaust their 10 requests quickly by loading the dashboard. Clients degrade silently (suggestions) or show the limit message (scan, meal plan). Revisit this policy before launch.

### Changes
- `src/lib/billing/server.ts`: `evaluateEntitlement` (shared by `requireEntitlement`) and `runMeteredAI`. It checks the entitlement, reserves, runs the provider call, then commits once if billable or releases otherwise (in `finally`, with cleanup errors logged). It fails closed (`unavailable`) when the lookup or reservation fails or the admin client is missing.
- `src/lib/server/ai-quota-response.ts`: maps outcomes to 403, 429 `AI_USAGE_LIMIT_REACHED` or 503 `AI_USAGE_UNAVAILABLE`.
- `coach`: refactored onto `runMeteredAI` with the same payloads.
- `suggestions`, `ai-scan`, `meal-plan`: now require authentication (401), which they previously lacked. They validate the body before reserving and use timeouts (45–60s). The ai-scan timeout timer leak is fixed, and provider error details are no longer returned to the client.
- `insights`: the `advanced_progress` entitlement is now checked inside the helper, with quota added. Body validation was added.
- Clients (`log/page.tsx`, `MealPlanClient.tsx`, `meal-plan/page.tsx`) show the limit message.

### Billable rules
Billable means the provider returned OK plus a usable parsed result. A non-OK response, a thrown or timed-out fetch, or an empty or unparseable result is released. Pre-provider rejections (401, 400, 503 missing key) never reserve. No route calls another AI route, so nothing is double counted.

### AI provider call sites
| Call site | Auth | Entitlement | Quota |
|---|---|---|---|
| `api/coach` via `ai-chat.ts` → `ai-providers.ts` | yes | `ai_coach` | reserve/commit/release |
| `api/insights` | yes | `advanced_progress` | reserve/commit/release |
| `api/suggestions` | yes | `ai_coach` | reserve/commit/release |
| `api/ai-scan` | yes | `ai_coach` | reserve/commit/release |
| `api/meal-plan` | yes | `ai_coach` | reserve/commit/release |
| `kayven-brain/ai-response-engine.ts` | n/a | n/a | **Dead code, no importers. Unprotected if ever wired up.** |

Other routes (health-agent, next-action, memories, meal-search, barcode, intelligence/context) make no AI provider calls.

### Tests
`npm test` covers success commit-once, release on non-billable and on exception, exhaustion without a provider call, fail-closed on reserve failure or missing client, no reserve on feature denial, cleanup failure, and per-user reservation. These tests use a fake RPC client. `tsc`, `lint` (existing warnings only), `build` and `git diff --check` pass.

### Limitations
- **Unverified:** SQL atomicity, concurrency and idempotency (no staging DB). The migrations are not applied.
- No reaper for reservations orphaned by a crash between reserve and commit.
- Empty or unparseable responses are released even though the provider cost was incurred.
- Route-level HTTP behavior is not covered by automated tests (only the helper).
- `/api/meal-plan` `customPrompt` is still passed to the provider as given (unchanged, now authenticated and metered).

## AI quota hardening, phase 2

### Task 1 — Dashboard suggestions are now explicit
- The only caller of `/api/suggestions` was the automatic call in `dashboard/page.tsx` `load()`. It is removed.
- The AI suggestions card shows whenever the user has logs today. A "Get suggestions" / "Refresh" button requests them. The card has loading, success, limit-reached (shows the server message) and error states. The card copy tells the user each request uses one monthly AI request.
- Duplicate clicks: the button is disabled while loading, and `src/lib/suggestions/request.ts` is a single-flight requester, so rapid clicks share one request.
- Limits and prices are unchanged.

### Task 2 — Orphaned reservation recovery
- New additive migration `supabase/migrations/20261018000000_expire_orphaned_ai_reservations.sql` (mirrored in `supabase-schema.sql`). **Not applied.**
- `release_expired_ai_usage_reservations(p_older_than interval default '15 minutes', p_limit int default 500)`:
  - `SECURITY DEFINER`, `search_path = public`, requires `auth.role() = 'service_role'`. Execute is revoked from public, anon and authenticated, and granted to service_role only. It takes no user ID or reservation ID, so it cannot release one user's reservation on another's behalf.
  - Only rows with `status = 'reserved'` and `created_at` older than the threshold are touched. The threshold has a 5-minute floor (provider calls time out within 60s), so active reservations are not released early.
  - Rows are selected `FOR UPDATE SKIP LOCKED` and each release is guarded by `status = 'reserved'`. Concurrent runs, repeat runs, and races with commit/release therefore cannot double-decrement. The counter decrement uses the same `request_count > 0` guard as `release_ai_usage_reservation`.
- TS: `releaseExpiredAIUsageReservations` in `billing/server.ts` (client-side threshold floor, fails if the admin client is missing).
- Trigger: `POST /api/internal/ai-reservations/cleanup` with `Authorization: Bearer $AI_CLEANUP_SECRET`. It fails closed (401) if the secret is unset. Expiry is configurable via `AI_RESERVATION_EXPIRY_MINUTES` (default 15). Both are in `.env.example`.
- **Production scheduling is not configured.** The repo has no `vercel.json` or CI workflows, and the hosting scheduler is unconfirmed. Once the host is confirmed, run the endpoint every ~15 minutes (Vercel Cron, a GitHub Actions schedule, or Supabase pg_cron calling the SQL function directly). Do not enable it until the migration is verified on staging.
- Known edge: if the original request finishes after the reaper released its reservation, its commit returns false (logged) and that one request goes uncounted. This is bounded by the 15-minute threshold being much longer than the 60s provider timeout.

### Task 3 — Accounting policy (documented, already uniformly implemented)
**One request is counted only when the provider returns a usable result.** Provider errors, timeouts, empty responses, unparseable or invalid output and thrown exceptions are released, so users are never charged quota for platform or provider failures. The provider cost of such calls is absorbed by the platform. Orphans from crashes are released by the reaper under the same policy. Published monthly limits are unchanged, and no user is charged extra. Residual risk: a user could repeatedly trigger calls that fail after cost is incurred; the per-user monthly quota does not bound that. If that matters, add a separate failure-rate limit (needs a product decision and was not added).

### Task 4 — Tests (in `npm test`)
- Dashboard `load()` does not fetch suggestions, and suggestions are requested only from the button handler (a source-level check).
- Repeated clicks produce one request, and a new request is allowed after it settles.
- Limit-reached, empty-response and network-error states.
- Cleanup: active reservations are untouched, expired ones are released with correct accounting, repeat cleanup is harmless, thresholds below the floor, a missing client and non-service roles are rejected, and a failed cleanup changes nothing.
- **The cleanup tests run against a JavaScript simulation of the SQL semantics. They do not test the SQL.**

### Validation
`npm test`, `tsc`, `build` and `git diff --check` pass. Lint has no errors (17 existing warnings).

### Remaining blockers
1. **High:** no isolated staging verification of any of the 4 migrations (atomicity, concurrency, `SKIP LOCKED` behavior, grants).
2. **High:** cleanup is not scheduled; the infrastructure is unconfirmed.
3. **Medium:** the shared-pool policy and the failure-cost exposure need a product decision.
4. **Medium:** no route-level HTTP tests. The cleanup route's secret check is untested.
5. **Low:** `ai-response-engine.ts` is dead and unmetered.

## Staging database & AI quota verification (phase 3)

### 1. Migration inventory and dependency order
| Order | File | AI-related | Depends on |
|---|---|---|---|
| 1 | `20261015000000_dashboard_indexes.sql` | no | existing tables |
| 2 | `20261017000000_sleep_logs.sql` | no | `profiles` |
| 3 | `20261017001000_atomic_ai_usage.sql` | yes (`consume_ai_usage`, `release_ai_usage`) | **`public.ai_usage`** |
| 4 | `20261017002000_idempotent_ai_usage_reservations.sql` | yes (reservation table, reserve/commit/release; revokes 3's helpers) | `profiles`, **`public.ai_usage`**, migration 3 |
| 5 | `20261018000000_expire_orphaned_ai_reservations.sql` | yes (`release_expired_ai_usage_reservations`) | migration 4 table |

### 2. Issues found
- **Dependency gap (Medium):** no migration creates `public.ai_usage` or `public.profiles`; they exist only in `supabase-schema.sql`. Migrations 3–5 fail on a database that lacks the baseline schema. Apply the baseline first, or add a migration creating `ai_usage`. Not changed (schema decision).
- **Cleanup assumptions verified:** the function uses only columns that exist (`reservation_id, user_id, period_start, status, created_at, updated_at`) and mirrors `release_ai_usage_reservation` (status guard, `request_count > 0` guard). No mismatch found.
- **Late commit after reaping (Low, by design):** a request that outlives the threshold gets `commit = false` and goes uncounted. The threshold (>= 5 min, default 15) is far above the 45–60 s provider timeouts.
- **Fixed:** `suggestions` and `insights` returned HTTP 200 with a null result on provider failure. They now return 502 `AI_RESULT_UNAVAILABLE`, consistent with `ai-scan` and `meal-plan`.
- **Fixed:** the cleanup endpoint was POST-only with a custom secret, so Vercel Cron (GET + `CRON_SECRET`) could not call it. It now accepts GET and POST, `AI_CLEANUP_SECRET` or `CRON_SECRET`, and refuses secrets under 16 characters.
- **Note:** Coach validates the message (400) before authentication (401); no provider is involved in either case.
- **Clean-install issue (resolved in the follow-up below):** the unwired `src/lib/rate-limiter.ts` imports `rate-limiter-flexible` and `ioredis`, which were initially undeclared. Both are now declared in `package.json` and locked in `package-lock.json`. The module has no application importers; it is preserved because it is existing untracked work, and clean TypeScript checks include it.

### 3. SQL tests actually executed (real database engine)
No Docker, `psql` or Supabase staging exists. I used **PGlite** (a real PostgreSQL build, in-process, disposable, dev dependency) via `npm run test:sql`. It runs the real migration files 3, 4 and 5 against stand-ins for Supabase's roles and `auth.role()`, plus the real `ai_usage` DDL extracted from `supabase-schema.sql`.
16/16 passed: reserve/commit/release; duplicate commit and release; commit after release and release after commit; unknown IDs; exhaustion (no reservation row created); 25 sequential reservations at a limit of 10 allow exactly 10; limit 0 and null; per-user isolation; invalid arguments; cleanup of expired rows only, with preserved active and committed rows; repeat cleanup; threshold and batch size bounds; cleanup followed by commit or release; monthly period isolation; no underflow; grants (anon and authenticated denied; service_role only; legacy helpers revoked); SECURITY DEFINER and pinned `search_path`.
**Not verified:** true concurrency. PGlite has one session, so concurrent reservations, concurrent cleanup runs, and cleanup racing with commit cannot be exercised. Safety there rests on code review (atomic `INSERT ... ON CONFLICT ... WHERE`, status-guarded updates, `FOR UPDATE SKIP LOCKED`) and still needs a real Supabase or PostgreSQL staging test with parallel connections. Real PostgREST/JWT role behavior and RLS on Supabase's own roles are also unverified. The stub reproduces only the `auth.role()` contract.

### 4. API tests actually executed (`npm test`, providers mocked, no network or credits)
`src/app/api/ai-routes.test.ts` runs the real route handlers with a mocked `fetch` and in-memory Supabase fakes. For each of **suggestions, ai-scan, meal-plan, insights**: 401 unauthenticated; 400 for invalid and oversized input; 503 for a missing provider key; no reserve or provider call on any of those; success commits once for the caller; provider HTTP error, thrown timeout, empty and malformed output all release with unchanged usage and an error status; exhausted quota returns 429 without a provider call; five repeated requests at a limit of 2 reach the provider only twice; a reservation failure or missing admin client returns 503 without a provider call; no API key or provider error text appears in any response. Also: insights entitlement denial returns 403 with no reserve. **Coach** (real route, with context, composer and the provider function stubbed): the same matrix except provider HTTP errors. **Cleanup route:** 401 without a valid secret (including a signed-in user), weak secrets refused, GET and POST accepted, default and configured thresholds, a threshold under the floor never reaches the database, the secret never appears in a response.
Limits: fakes, not Supabase. Coach internals other than the quota path are stubbed. Real-provider timeout behavior is simulated by a thrown error.

### 5. Failure-cost protection
Implemented (`src/lib/billing/abuse-guard.ts`, used by `runMeteredAI`): per-user one-request-in-flight limit and a failure cooldown (5 non-billable or thrown provider outcomes within 10 minutes gives 429 `AI_REQUEST_THROTTLED` with `Retry-After`). Quota exhaustion and reservation failures do not count as provider failures. Input bounds: suggestions logs <= 200, insights weeklyLogs <= 31, meal-plan `customPrompt` <= 4000 chars, ai-scan image <= 8 MB, Coach message <= 1200 chars. Provider timeouts: 45 s (suggestions, insights), 60 s (ai-scan, meal-plan). Plan prices and monthly quotas are unchanged.
**The guard is in memory, per server instance**, so on serverless hosting it is not shared across instances and resets on cold starts. It stops accidental repeats and single-instance abuse, not a distributed attacker. A durable version needs one of: (a) a new additive SQL change counting recent `released` reservations per user (the table already has `status` and `updated_at`) inside `reserve_ai_usage`, which needs staging verification; (b) a shared store such as Redis/Upstash (new service, needs approval). Recommendation: (a) once staging exists.

### 6. Cleanup scheduling
- Platform evidence: a `.vercel/` project link exists locally, so Vercel is the likely host. It is **not confirmed** that production is deployed there, and the plan tier is unknown. No scheduler was added or activated, and no `vercel.json` was created.
- If Vercel: add a cron entry to `vercel.json` only after approval and after migrations are verified on staging:
  `{ "crons": [{ "path": "/api/internal/ai-reservations/cleanup", "schedule": "*/15 * * * *" }] }`
  Set `CRON_SECRET` (>= 16 random chars) in Vercel project env vars. Vercel then sends `Authorization: Bearer $CRON_SECRET` on its GET call. Hobby plans only allow daily crons (orphans then stay counted up to 24 h), and Pro allows sub-hourly. Otherwise call the endpoint with `AI_CLEANUP_SECRET` from any scheduler, or run the SQL function with pg_cron on Supabase.
- Secret handling: both variables are server-only (not `NEXT_PUBLIC_`), compared in constant time, never returned or logged.
- Active reservations are safe: the SQL floor (5 minutes), the TypeScript floor, and `AI_RESERVATION_EXPIRY_MINUTES` (default 15) all apply. A misconfigured value below the floor makes the job fail with 500 instead of releasing anything (tested).
- Monitoring: a successful run logs `[AI reservation cleanup] released=N`; failures log an error and return 500, which Vercel shows in Cron Jobs and function logs. Alert on repeated 500s, and watch for `released` staying above 0 on every run (a sign of repeated crashes).

### 7. Validation results
`npm test` pass; `npm run test:sql` 16/16; `tsc` pass; `lint` 0 errors (17 existing warnings); `build` pass; `git diff --check` clean.

### 8. Reproduce
```

## AI metering verification and legacy RPC review (2026-10-18)

### Task 1 — Intermittent local REST 503
- The previous 503 was not reproducible in a stress rerun: `KAYVEN_HTTP_RACE_REPEATS=30 npm run test:sql:local` issued 750 concurrent PostgREST reservation RPCs (30 independent users × 25 calls) and all returned 200; each batch allowed exactly 5 of its 25 calls. The quota/count assertions passed.
- The harness now captures status counts and a 300-character response diagnostic on any non-200. The diagnostic redacts JWT-looking strings, bearer values, API-key/secret fields, and UUIDs. No error body was observed in this run because there were no failed requests.
- Local PostgREST logs contained startup/schema-cache readiness, with no 503, error, timeout, or connection-refused entry. Kong access logs for the stress run contained successful RPC requests. The PostgREST pool is configured for 10 connections while the harness issues 25 simultaneous HTTP requests, but it queued the tested load successfully.
- **Root cause remains unresolved.** The earlier 503 happened immediately after replaying DDL; schema-cache refresh or container warm-up is plausible, but the old response body and contemporaneous logs were not captured. It was not an `allowed=false` quota result: those are normal HTTP 200 RPC responses. There is no evidence it came from `reserve_ai_usage` returning a business denial. Do not label the hypothesis as confirmed.

### Task 2 — Legacy `record_ai_usage`
- Complete definition is only in `supabase-schema.sql`. Search found no active application, trigger, migration, or SQL call site; other references are documentation/audit notes.
- It is `SECURITY DEFINER`, pins `search_path = public`, and checks `auth.uid() IS NOT NULL`. It inserts/upserts `ai_usage` using `auth.uid()` and increments `request_count`, token totals, estimated cost and period end. It accepts no request limit or reservation ID and does **not** create a reservation row. If invoked as a user with function permission, it can increment usage outside the atomic reservation lifecycle.
- The baseline explicitly revokes execution from `PUBLIC`, `anon`, and `authenticated`, but not `service_role`. On the disposable Supabase project the effective ACL was `{postgres=X/postgres,service_role=X/postgres}`: only the DB owner and service role could execute it. PostgREST authenticated-user invocation was rejected; a normal service-role call has no `auth.uid()` and failed with `Authentication required`; before/after usage and token counters were unchanged. This behavior is covered by the local integration suite.
- No current app caller means no observed duplicate accounting. A trusted service-role caller that supplies a non-null `auth.uid()` context could increment usage without a reservation, so the latent bypass is real for privileged code, not for ordinary clients. **Least-risk remediation:** after checking for out-of-repository server consumers, add an explicit `REVOKE EXECUTE ... FROM service_role` both to the baseline and to a new additive migration. Do not drop the function yet. No SQL permission was changed in this pass.

### Task 3 — Application metering
`runMeteredAI` checks entitlement, starts the per-user guard, reserves via `reserve_ai_usage` using the server-only admin client, invokes the operation only on an allowed reservation, then calls exactly one terminal RPC: commit for `billable=true`, release otherwise. Provider exceptions release in the finalization path and propagate to the route's generic error response. DB finalization errors are logged and swallowed; this means a route can still return its result if a commit RPC fails. That failure path was not simulated against real PostgREST and remains an accounting limitation to address before relying on hosted availability.

Route-by-route results:

| Route | Entitlement / shared quota | Local app-to-DB checks |
|---|---|---|
| `/api/coach` | `ai_coach` entitlement and shared monthly `ai_coach` reservation | Actual route, GoTrue JWT/PostgREST auth and DB reservation used; coach AI selector/generator stubbed. Success committed once; null/throw outcomes released; exhausted/failing reservation blocked generation. |
| `/api/insights` | `advanced_progress` entitlement plus same shared monthly AI pool | Actual route and local DB; standard-plan test user; mocked provider success committed once; HTTP error, empty, invalid JSON, valid-but-wrong-shape JSON, and thrown timeout released without increment. |
| `/api/suggestions` | `ai_coach` entitlement and shared pool | Same real route/DB coverage as above. |
| `/api/ai-scan` | `ai_coach` entitlement and shared pool | Same real route/DB coverage; provider error logging was tightened to log only the HTTP status, not the upstream error body. |
| `/api/meal-plan` | `ai_coach` entitlement and shared pool | Same real route/DB coverage as above. |

Additional findings/fixes:
- Suggestions and insights previously treated any parseable non-null JSON as billable. They now validate the fields consumed by the UI; malformed JSON and structurally invalid JSON are returned as unavailable and released. Route tests now include valid-but-wrong-shape output.
- `meteredAIFailureResponse` returns 429 with `Retry-After` for in-flight/cooldown throttling; a focused assertion verifies the header. Quota exhaustion is 429 without `Retry-After`; reservation storage errors are 503.
- All routes authenticate before any provider call. Coach parses/validates the message before auth, but still performs no AI work before auth. Invalid input, entitlement denial, missing API key, failed reservation, and exhaustion do not call the provider.
- The new `scripts/sql-tests/local-app-metering.mjs` invokes the actual five route handlers, actual billing helpers, actual local GoTrue user JWTs, PostgREST reads, and real local reservation/commit/release RPCs. Anthropic calls are intercepted with fixtures; Coach's selector and AI generator are stubbed to force the metered AI branch. It checks success (one commit), provider HTTP error, empty, syntactically malformed, wrong-shape, thrown-exception paths (one release and unchanged count), invalid admin credentials (503, no provider call and unchanged quota), exhaustion (429, no provider call), and user isolation. **33/33 checks passed.** No external provider request or charge was made.
- Separate `npm test` tests use in-memory Supabase fakes for invalid input, unauthenticated requests, entitlement denial, repeated requests and response sanitization. They complement, but do not replace, the local PostgREST integration checks.

### Task 4 — Reproducibility
- `npm ci` passed in a fresh disposable copy excluding `.env*`, `.git`, `node_modules`, and Vercel metadata.
- From that clean install: `npm test` passed; `npm run test:sql` passed 16/16 PGlite tests; `npm run test:sql:local` passed 16/16 real local-Supabase tests; `npm run test:metering:local` passed 33/33; TypeScript passed; lint exited 0 with 17 existing warnings and no errors; build passed with non-production localhost placeholders; `git diff --check` passed.
- Existing dependency audit/deprecation notices were not changed as part of this task.

### Remaining blockers before hosted staging
1. The original transient 503's root cause is unresolved; it was not reproduced under 750 concurrent local HTTP calls. The new diagnostic captures sanitized bodies on a future failure.
2. `record_ai_usage` is unused by this app but remains executable by `service_role`; add an explicit service-role revoke only after external consumers are ruled out and the migration is reviewed.
3. `runMeteredAI` currently suppresses commit/release RPC failures after logging them. A successful response can be returned even when commit was not confirmed. Define and test the failure policy, preferably with idempotent commit retry and a safe unavailable response, before relying on hosted database outages.
4. Local PostgreSQL/PostgREST tests do not establish hosted Supabase versions, pooling, defaults, or performance. Keep all hosted verification isolated and approved.
5. The in-memory abuse guard is per server instance; it is not a distributed rate limit.

No hosted database was contacted or modified. No migration, SQL grant, checkout, payment, deployment, commit, or push was performed.
npm test                                  # unit + route tests (mocked providers, in-memory fakes)
npm run test:sql                          # real migrations on disposable in-process PostgreSQL
npx tsc --noEmit --incremental false
npm run lint
npm run build
git diff --check
KAYVEN_TEST_VERBOSE=1 npm test            # show suppressed server logs while debugging
```

### 9. Remaining production blockers
1. **High:** no concurrency or Supabase-role verification. Run `npm run test:sql`-style tests against a real isolated Supabase or PostgreSQL project with parallel connections, then apply migrations 3–5 in order after the baseline schema.
2. **High:** cleanup unscheduled; host and plan tier unconfirmed.
3. **Medium:** `ai_usage` and `profiles` are not created by migrations (dependency gap above).
4. **Medium:** the failure guard is per-instance only (see 5). The shared-pool policy and the failure-cost policy still need product sign-off.
5. **Low:** dead `ai-response-engine.ts`; `rate-limiter.ts` is currently unused by application routes.

### 10. Production safety
No connection to any Supabase project was made, no migration was applied anywhere, and no secret was read or printed. Test environment variables are fake values. Checkout remains disabled. Nothing was committed or pushed.

## Clean install & staging readiness (2026-10-18)

### Exact changes
- Added `rate-limiter-flexible` and `ioredis` to runtime `dependencies` and synchronized `package-lock.json` using `npm install`. These packages are imported only by the preserved, untracked `src/lib/rate-limiter.ts`; no active application code imports that module. Dependencies are declared rather than deleting or rewriting untracked work.
- No schema, migration, route, pricing, quota, scheduler, or deployment changes were made.

### Clean-install result
- Copied the working tree to a disposable `/tmp` directory, excluding `.git`, `node_modules`, build output, `.vercel` metadata, `supabase/.temp`, and all `.env*` files. `npm ci` installed successfully from the updated manifest and lockfile; the test copy contained no environment files.
- From that clean install: `npm test` passed; `npm run test:sql` passed 16/16; `npx tsc --noEmit --incremental false` passed; `npm run lint` exited successfully with 17 warnings and no errors; `npm run build` passed with nonfunctional localhost Supabase placeholders and no provider credentials. Build without the required Supabase URL failed during page-data collection with `supabaseUrl is required`; no remote target was used.
- `npm ci` reported 24 dependency audit findings (2 low, 2 moderate, 19 high, 1 critical) and existing deprecation notices, including the pinned Next.js 14.2.0. No audit-driven upgrades were made in this scoped task.
- `git diff --check` passed in the repository. The temporary copy had no `.git` directory, so this check was run against the source worktree.

### Migration readiness review
The complete required sequence for a fresh Supabase database is:
1. Provision a fresh isolated Supabase database (so its `auth` schema, roles, and `auth.users` already exist).
2. Apply `supabase-schema.sql` once as the baseline.
3. Apply `20261015000000_dashboard_indexes.sql`.
4. Apply `20261017000000_sleep_logs.sql`.
5. Apply `20261017001000_atomic_ai_usage.sql`.
6. Apply `20261017002000_idempotent_ai_usage_reservations.sql`.
7. Apply `20261018000000_expire_orphaned_ai_reservations.sql`.

The baseline already defines `profiles`, `food_logs`, `weight_logs`, `sleep_logs`, `ai_usage`, `ai_usage_reservations`, and the quota RPCs. Thus the later migrations deliberately overlap baseline objects: the quota migrations use `CREATE OR REPLACE FUNCTION`; reservation table and index creation use `IF NOT EXISTS`; the sleep migration replaces its named policy after dropping it; and dashboard indexes use `IF NOT EXISTS` (the optional water-log index is guarded by column checks). This makes the reviewed migrations repeatable against the same expected shape, but is not proof against drift: `IF NOT EXISTS` does not repair an existing table with incompatible columns or constraints. The dashboard migration requires the baseline `food_logs` and `weight_logs`; the sleep and quota migrations require `profiles`, and quota migrations require `ai_usage`.

**Do not replay `supabase-schema.sql` on an existing database.** It is a bootstrap script, not a migration reconciler. Although many table/index creations use `IF NOT EXISTS`, it also replaces policies/functions, enables RLS, revokes privileges, and normalizes subscription rows/constraints. It can change behavior/data on an existing database and cannot repair arbitrary schema drift. For an existing isolated staging database, inspect the catalog and migration history first; apply only verified pending migrations. No baseline or migration was applied during this task.

Permission/RLS review: `ai_usage_reservations` has RLS enabled and no client policy, and client table privileges are revoked; `ai_usage` retains an owner-only select policy. Quota functions are `SECURITY DEFINER` with `search_path = public`, verify `auth.role() = 'service_role'`, revoke execution from `PUBLIC`, `anon`, and `authenticated`, and grant the reservation/commit/release/cleanup RPCs to `service_role`. Migration 4 also revokes service-role execution of the superseded consume/release functions. These were static findings only; actual Supabase grants, default privileges, and JWT role mapping remain unverified.

### Staging availability and unverified tests
- The Supabase CLI is installed, but there is no `supabase/config.toml`, Docker, `psql`, or local PostgreSQL server. No isolated staging database was identified. No remote project listing/status call was made, and no `.env*` file was read. The `.vercel/` directory is repository metadata only; it does not establish the deployment host or plan. No scheduler was added.
- Only the prior PGlite tests were performed (16/16, one in-process session). They are simulated Supabase roles, not Supabase JWT/PostgREST tests. No true multi-connection SQL test, real migration apply, real role test, or cleanup/commit race was performed. Do not treat the database as staging-verified.

### Reproducible isolated staging test sequence (not executed)
1. Install Docker Desktop and use a disposable local Supabase workspace; do not `supabase link` it to a hosted project. Copy the repository migrations into that workspace. Place an unchanged copy of `supabase-schema.sql` in the workspace as the earliest baseline migration (timestamp before `20261015000000`), then run `supabase start` and `supabase db reset`. Confirm migration history and schema on the local stack before creating test users/data.
2. Create disposable auth users and profiles only. From at least 20 separate database connections, synchronize calls to `reserve_ai_usage` for the same user/period with a limit of 10; assert exactly 10 allowed, all other calls denied, and `ai_usage.request_count = 10`. Repeat with a second user to prove isolation.
3. On separate connections, race `commit_ai_usage_reservation`, `release_ai_usage_reservation`, and `release_expired_ai_usage_reservations` against the same IDs. Accept only the serialized legal terminal states; assert duplicate calls are idempotent, committed rows are not released, active/nonexpired reservations survive cleanup, and request counts never become negative or exceed the quota.
4. Verify the cleanup floor (under 5 minutes rejected), expiry boundary, batch cap, and monthly period separation. Test at timestamps immediately before/on/after period boundaries using controlled period arguments and disposable rows.
5. Through local PostgREST with the local anon key, authenticated user JWTs, and service-role JWT, assert anon/authenticated RPC requests are denied, service-role calls succeed, users cannot inspect reservations or affect another user's usage, and actual `auth.role()` mappings are correct. Do not print or commit local keys.
6. Remove only the disposable local stack/test data after recording results. For an existing staging DB with the baseline already installed, do not reapply the baseline; snapshot/check its schema and migration history first.

### Scheduling and blockers
The cleanup scheduler remains inactive. Confirm the actual hosting platform and plan before selecting a scheduler. If Vercel is confirmed, deploy configuration should use a protected GET to `/api/internal/ai-reservations/cleanup` and a server-only `CRON_SECRET`; otherwise use the confirmed platform's scheduler or Supabase `pg_cron`. Keep `AI_RESERVATION_EXPIRY_MINUTES` at or above the 5-minute SQL floor (the documented default is 15 minutes), and monitor endpoint failures/released counts. Do not add `vercel.json` or enable a schedule without approval.

**Remaining blockers:** Docker/local Supabase or a dedicated isolated staging project; real multi-connection concurrency and race tests; real Supabase JWT/PostgREST authorization verification; an explicit deployment host/plan and scheduler decision; follow-up triage of npm's 24 dependency audit findings. Production remains untouched; checkout remains disabled; no secrets were accessed or exposed; no commit or push was made.

> **Update (same day):** Docker Desktop and the Supabase CLI later became available. The "no Docker / no local Supabase" statements above are superseded by the next section, which records real local-Supabase results.

## Local Supabase verification (disposable Docker stack, 2026-10-18)

### Environment (verified isolated)
- Docker 29.8.2 and Supabase CLI 2.121.0 (the Docker CLI was not on the shell `PATH`; `/Applications/Docker.app/Contents/Resources/bin` was added for the session only).
- The repo's `supabase/` folder had no `config.toml`, was not linked to any project, and was **not modified**. A separate throwaway workspace `/tmp/kayven-supabase-local` (`project_id = kayven-supabase-local`) was created with `supabase init`; no `supabase link`, `db push` or remote command was run. Only four containers ran (Postgres 17.11, GoTrue, PostgREST, Kong), bound to `127.0.0.1:54321/54322`. The suite refuses to run unless both the DB and API hosts are localhost. Local-stack keys were read in memory only and never printed or stored.
- Memory budget: Docker had ~4 GB, so Studio, Realtime, Storage, Imgproxy, Mailpit, Edge runtime, Logflare, Vector, Supavisor and Postgres-meta were excluded.

### Migration order (confirmed) and results
Baseline `supabase-schema.sql` (installed as migration `20260101000000_baseline.sql`; it creates `profiles` and `ai_usage`, which no later migration creates), then `20261015000000`, `20261017000000`, `20261017001000`, `20261017002000`, `20261018000000`.
- **Scenario A, fresh DB** (working-tree baseline + 5 migrations): all six applied with `supabase db reset --local`, no errors. Migration history, RLS (on for `ai_usage`, `ai_usage_reservations`, `sleep_logs`), `SECURITY DEFINER` + `search_path=public` on every quota RPC, and grants verified in the catalog: `anon` and `authenticated` cannot execute any quota RPC; `service_role` can execute reserve, commit, release and cleanup; the legacy `consume_ai_usage` / `release_ai_usage` are executable by nobody. `ai_usage_reservations` has no policy and no `anon`/`authenticated` table grants.
- **Scenario B, existing DB** (committed HEAD baseline, which has `ai_usage` but no reservations or `sleep_logs`, plus the 5 migrations): applied without errors; full suite passed.
- **Replay test** (disposable DB only): re-running the baseline and every migration a second time produced only "already exists, skipping" notices, no errors, and grants stayed locked down. This shows the files tolerate replay on a database of the *same shape*; it does not show they repair drift. Still do not replay the baseline on a real database.

### Tests actually executed: `npm run test:sql:local` (15 tests, real Postgres, separate connections)
Script: `scripts/sql-tests/local-supabase.mjs`. All 15 passed in Scenario A and B (and 3 further consecutive runs).
1. 40 parallel reservations on separate connections, limit 10: exactly 10 allowed; request count and live reservations agree.
2. 25 parallel reservations through PostgREST with the service-role key, limit 5: exactly 5 allowed.
3. One user's exhaustion does not affect another user's quota.
4. 20 parallel commits and 20 parallel releases on each of 12 reservations: each ends in a single terminal state; counts consistent.
5. Duplicate commit/release, release-after-commit and commit-after-release are idempotent and never flip state.
6. Cleanup releases only expired `reserved` rows; active (10 min), fresh and committed rows are preserved; repeat is harmless; the 5-minute floor and batch bound are enforced.
7. 8 concurrent cleanup runs release 40 expired reservations exactly once in total.
8. Cleanup racing with commit and release on the same expired rows keeps the invariant `request_count == live (reserved + committed) reservations`.
9. `request_count` does not underflow when the usage row is already 0.
10. Monthly periods are independent; releases do not cross periods.
11. Limit 0, null (unlimited) and invalid arguments behave and leave no state.
12. A rolled-back transaction leaves no usage and no reservation (a DB failure cannot grant or burn quota).
13. Real GoTrue JWTs through PostgREST: anon and authenticated tokens are rejected (4xx) on all six privileged RPCs and change nothing; the service role can run cleanup; legacy helpers are not callable even by the service role.
14. Authenticated users cannot read reservations, see only their own `ai_usage` rows, and cannot modify their quota.
15. Direct sessions as `anon`/`authenticated` get permission denied; a call without a role claim gets "Service role required".
- **The suite can fail:** two deliberate defects were injected into the local DB only. (a) Granting `reserve_ai_usage` to `anon` failed test 15; the in-function role check still rejected `anon`, showing the two layers are independent. (b) Removing the quota guard from the upsert made 6 tests fail (40 reservations allowed against a limit of 10). Both were reverted by a database reset.
- Test users are disposable (`kayven-it-*@example.test`); the suite deletes only the users it created (data cascades).

### Remaining unverified
- Behavior under a real **hosted** Supabase project (different Postgres/PostgREST versions, default privileges, connection pooling through Supavisor, `auth.role()` deprecation). Local images are the CLI's pinned versions.
- Concurrency is exercised with up to 40 simultaneous connections on a single local Postgres, not under production load or multi-region latency.
- A single transient HTTP 503 from PostgREST appeared once, in the HTTP race, immediately after the replay DDL; PostgREST had just reloaded its schema cache. It did not recur in 3+ later runs, and I did not capture the response body, so the cause is **unproven** (probably the reload). The application treats any reservation failure as fail-closed (503, no provider call), which is the safe behavior.
- The application routes were not run against this database; route tests still use mocked providers and in-memory fakes. End-to-end app-to-local-Supabase (service-role client against PostgREST) has not been run.
- `record_ai_usage` (baseline, legacy) remains executable by `service_role` but requires `auth.uid()`, so it is inert for that role. Consider revoking it; not changed.

### Validation (repo)
`npm test` pass; `npm run test:sql` 16/16 (PGlite); `npm run test:sql:local` 15/15; `tsc` pass; `lint` 0 errors (17 existing warnings); `build` pass; `git diff --check` clean.

### Changes made
- Added `scripts/sql-tests/local-supabase.mjs` and script `test:sql:local`; added devDependency `pg` (lockfile updated). No schema, migration, route, pricing or quota change. Nothing was committed or pushed. Hosted databases and production were never contacted.

### Reproduce
```
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"   # if docker is not on PATH
mkdir -p /tmp/kayven-supabase-local && cd /tmp/kayven-supabase-local && supabase init
mkdir -p supabase/migrations
cp <repo>/supabase-schema.sql supabase/migrations/20260101000000_baseline.sql
cp <repo>/supabase/migrations/*.sql supabase/migrations/
supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
supabase db reset --local
cd <repo> && npm run test:sql:local        # uses KAYVEN_SUPABASE_WORKDIR (default /tmp/kayven-supabase-local)
cd /tmp/kayven-supabase-local && supabase stop
```

## Phase 6 — Safe AI reservation finalization (2026-10-18)

### Reservation state machine (existing schema, no SQL change)
`reserved → committed` (commit) or `reserved → released` (release / expiry cleanup). Both terminal states are idempotent no-ops in SQL: commit returns true if already committed and false if released; release returns true if already released and false if committed. Release decrements `request_count` only when it moves `reserved → released` (guarded `> 0`). Row locks serialize commit, release and cleanup, so one terminal state wins. Invariant: `request_count == reserved + committed`.

### Failure scenarios and behaviour
| Scenario | Behaviour now |
|---|---|
| Reservation succeeded, response lost | App fails closed (503), no provider call. Row stays `reserved`; expiry cleanup (>= 5 min floor, default 15) refunds it. Temporary over-count, never extra usage. |
| Provider ok, commit fails | Commit retried up to 3 times (150/300 ms backoff, 5 s per attempt). If still unconfirmed, the route returns 503 and never releases the reservation. The database may have committed despite the lost response; otherwise cleanup may later refund the pending row, causing a residual under-count for provider work already performed. |
| Commit applied in DB, client timed out | Treated as ambiguous. Never released. Retrying commit is idempotent and confirms. |
| Provider fails, release fails | Bounded retries; row stays `reserved` (over-count) until cleanup. No extra quota. |
| Commit vs cleanup / release vs cleanup race | Row locks; exactly one terminal state. A late commit after cleanup returns false and is logged as `conflict` (not retried, never converted). If cleanup wins before a delayed commit, an already-performed provider operation can be under-counted. |
| Retry after unknown outcome | Only the same transition is retried; commit is never converted into release. |

### Implementation
`finalizeReservation()` in `src/lib/billing/server.ts` replaces the swallow-and-log `finally`. It returns `confirmed | conflict | unconfirmed`, is bounded (3 attempts, per-attempt timeout), and never fails open. `runMeteredAI` accepts an optional `finalization` option (used by tests). No schema change; none is needed.

### Tests actually executed
- Mocked (`npm test`): retry on transient error, bounded attempts, hung-attempt timeout, conflict without retry, no release after failed commit, release failure cannot grant extra quota.
- Real local Supabase (`npm run test:metering:local`, 38/38; real routes, GoTrue JWTs, PostgREST, Postgres; provider mocked; network faults injected on the finalize RPCs): commit applied + reply lost → retry confirms, counted once; commit never reaches DB → 3 attempts, no release, row left `reserved`; release unreachable → row left `reserved`; release applied + reply lost → decremented once; cleanup restores `request_count == committed`.
- Existing real-DB race tests (`npm run test:sql:local`, 16/16): concurrent cleanup x8, cleanup racing commit/release, reserve race (incl. HTTP).
- `npm run test:sql` 16/16 (PGlite, single session).
- `tsc` clean; lint 0 errors (warnings pre-existing); `npm ci` + `npm test` + `npm run build` pass in a clean copy; `git diff --check` clean.

### record_ai_usage
Repo search (src, scripts, supabase, docs): only the baseline `supabase-schema.sql` defines it; no application, trigger or migration calls it. It upserts `ai_usage` without a limit or reservation row, and is still granted to `service_role` (requires `auth.uid()`, so service-role calls without a user JWT fail). External consumers (dashboards, other services, SQL editor jobs) cannot be ruled out from the repo. Recommendation, not applied: confirm no external use, then add an additive migration `REVOKE EXECUTE ON FUNCTION public.record_ai_usage(...) FROM service_role` (and mirror in the baseline); drop only after a deprecation period.

### Remaining risks / blockers
- Hosted staging not verified; original intermittent 503 not reproduced (unresolved).
- If a provider succeeded but commit never reached the database, expiry cleanup can refund that unit; this is an under-count of work already performed.
- A request that outlives the expiry threshold (>> provider timeout) could be reaped before commit (bounded by timeouts).
- `record_ai_usage` grant to `service_role` pending the migration decision.
- Abuse guard is per-instance; cleanup scheduler not activated, host unconfirmed.

## Final engineering sprint — metering finalization and dependency review (2026-10-18)

### Code changes in this sprint
- `src/lib/billing/server.ts`: billable results are returned only after the reservation commit is confirmed. A non-confirmed finalization after an `execute` result returns the safe `unavailable` outcome (503); execution exceptions remain the route outcome after a bounded release attempt. Attempts remain capped at three even if caller-supplied test options request more. Finalization logs contain operation/attempt state only, not database errors, secrets, provider responses, or user content.
- `src/lib/billing/billing.test.ts`: verifies bounded retries, timeouts, opposite terminal state, no commit-to-release conversion, fail-closed response, and no quota grant when release is unconfirmed.
- `src/app/api/ai-routes.test.ts`: all five route handlers return a sanitized 503 after an unconfirmed commit and do not release the reservation.
- `scripts/sql-tests/local-app-metering.mjs`: the real route-to-local-Postgres fault-injection case now expects 503 for an unconfirmed commit and asserts that its reservation stays reserved.
- `package.json` and `package-lock.json`: pinned Next.js to the same-major security patch `14.2.35`, updated direct PostCSS to `^8.5.30`, then ran non-force `npm audit fix` for compatible transitive updates. No major framework or UI dependency upgrade was made.
- This sprint did not change a database migration or the baseline schema.

### Reservation lifecycle and explicit limitations
The existing database state machine remains `reserved → committed` or `reserved → released`; terminal transitions are idempotent by stable `reservation_id`. Reserve is atomic with quota increment. Commit, release and cleanup serialize on row locks; release decrements only on the `reserved → released` transition and guards against a negative count.

Finalization makes at most three attempts with increasing 150/300 ms delays and a 5 second wait limit per attempt. A timeout does not cancel the underlying PostgREST request; it may still finish later. Retries always use the same reservation ID and same operation, so they cannot switch a commit into a release. If commit remains unconfirmed, the route returns 503 and does not release. The row may already be committed, still be reserved, or a timed-out request may complete later. If it remains reserved, expiry cleanup may refund the request after the provider incurred cost. This residual under-count is not eliminated by the current schema.

There is no durable client request-idempotency key in the current schema/API. A client retry after a 503 reserves a new ID; it cannot bypass the monthly limit, but may perform duplicate provider work and consume another quota unit. Guaranteeing exactly-once behavior across client retries would require an API idempotency key plus a schema change and is not claimed here. An unusually delayed active operation can also race the expiry threshold; row locking prevents a committed row from being released, but cleanup can win before a delayed commit and refund work whose provider call already succeeded.

### Database inventory reviewed
Relevant migration order in the disposable local project: `20260101000000_baseline.sql` (copied from `supabase-schema.sql`), `20261015000000_dashboard_indexes.sql`, `20261017000000_sleep_logs.sql`, `20261017001000_atomic_ai_usage.sql`, `20261017002000_idempotent_ai_usage_reservations.sql`, `20261018000000_expire_orphaned_ai_reservations.sql`. Reservation and cleanup SQL were not modified in this sprint. No hosted project was contacted.

`record_ai_usage` is only defined in `supabase-schema.sql`; repository search found no application or migration caller (remaining matches are docs and a negative authorization integration test). It increments usage without enforcing a monthly limit or creating a reservation, so it would bypass the reservation invariant if a privileged database caller supplied a valid user claim. User roles are revoked and the local PostgREST test confirms anon/authenticated cannot call it; a service-role call without `auth.uid()` cannot mutate usage. External consumers cannot be excluded from repository evidence, so it was not revoked or dropped.

### Tests executed on the current lockfile
- `npm ci`: pass; clean lockfile install, no dependency manifest drift.
- `npm test`: pass; billing unit and all five mocked route suites, including finalization failure → 503.
- `npm run test:sql`: 16/16 pass (PGlite single-session; not a concurrency substitute).
- `npm run test:sql:local`: 16/16 pass against the disposable local Supabase/Postgres stack with separate connections, JWT/PostgREST role checks, concurrent reserve/commit/release/cleanup, rollback and monthly-boundary cases.
- `npm run test:metering:local`: 39/39 pass; actual route handlers, GoTrue JWTs, PostgREST and local Postgres, with external AI calls mocked. Includes lost reserve/commit/release responses, bounded unreachable finalization, 503 on unconfirmed commit and cleanup accounting.
- `npx tsc --noEmit --incremental false`: pass when run after build output settled. An earlier parallel invocation raced `next build` while `.next/types` was being regenerated and failed with missing generated files; the sequential rerun passed.
- `npm run lint`: pass, 0 errors and 17 existing warnings.
- `npm run build`: pass with local placeholder Supabase/provider values, Next.js 14.2.35.
- `git diff --check`: pass.

No test above used a hosted or production database. The local Supabase stack was disposable and is stopped after validation.

### Dependency audit
Before security updates, `npm audit` reported 24 issues (2 low, 2 moderate, 19 high, 1 critical). Same-major Next and PostCSS updates plus `npm audit fix` without `--force` reduced this to 18 (2 low, 2 moderate, 13 high, 1 critical). Current production-only audit reports 4 (2 low, 1 high, 1 critical):
- **Critical, production, direct:** `next@14.2.35` remains inside the current affected range; advisories include unauthenticated RCE in the Image Optimization API for AVIF and Windows-hosted servers. npm reports a fix at `next@16.4.2`, which is a major upgrade and was not applied.
- **High, production, transitive:** vulnerable `postcss` remains nested under Next at `8.4.31`; root PostCSS is patched, but safely replacing Next's exact nested dependency was not assumed.
- **High, development tree:** remaining findings include `eslint-config-next`/Next ESLint dependencies, Tailwind 3 and Sharp; available fixes require major upgrades (Next ESLint 16, Tailwind 4, Sharp 0.35). Those were not applied.
- Remaining low findings are in `@supabase/ssr` and `cookie`. The compatible audit fixes for other transitive packages were applied by regular `npm audit fix`; no `--force` was used. `npm audit fix` still exits nonzero because findings requiring breaking upgrades remain.

### Readiness and required next steps
Automated local verification passes, but this is **not production-ready**: no hosted staging verification has been performed; the original local REST 503 remains unresolved/not reproduced; the cleanup scheduler and deployment host remain unconfirmed; external consumers of `record_ai_usage` have not been ruled out; and provider execution/finalization is not exactly-once. The final production-only audit has no critical, high, or moderate findings, but two low findings remain in Supabase SSR/cookie. Before production, complete isolated hosted staging, confirm legacy RPC consumers, verify the deployment host and configure/monitor cleanup, and plan the compatible major upgrade for the remaining low findings. Keep checkout disabled until separately approved.

No hosted database was accessed or modified, no production deployment or payment activation occurred, and no commit or push was made. The local Supabase startup command emitted generated local-only credentials in its CLI output; the disposable stack was stopped and its temporary startup log removed. No hosted or production credentials were used.

## Final blocker resolution — 2026-10-18

This section supersedes earlier dependency-audit and client-idempotency conclusions above.

### Production dependency audit

- Upgraded Next.js from 14.2.35 to 15.5.28 and aligned `eslint-config-next` to 15.5.28. This removes the prior Next.js critical advisories GHSA-p293-qw3h-jr36 (Windows-hosted RCE) and GHSA-2xp9-vwfh-vxw4 (AVIF image-optimizer RCE). The required async `cookies()` and request-IP typing changes are included; the final build and TypeScript check pass.
- The initial audit also identified vulnerable PostCSS nested under Next (`8.4.31`): GHSA-6g55-p6wh-862q and GHSA-r28c-9q8g-f849 (high), plus related GHSA-qx2v-qp2m-jg93 and GHSA-fxqj-rqcc-2cmp. Added a lockfile-enforced override in `package.json` to use the direct patched PostCSS `8.5.30`; `npm ls` confirms Next resolves that patched version.
- Updated Sharp from `0.34.5` to `0.35.5`. This resolves GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, and GHSA-wq5f-xc86-pv6w. Sharp was a dev dependency also satisfying Next's optional runtime dependency, which is why it appeared in `npm audit --omit=dev`.
- Final `npm audit --omit=dev`: **0 critical, 0 high, 0 moderate, 2 low**. The remaining low advisory is GHSA-pxg6-pf52-xh8x in `cookie@0.5.0`, reached through `@supabase/ssr@0.1.0`; npm's fix requires the major `@supabase/ssr@0.12.7` upgrade. It was not changed in this sprint.
- Final full `npm audit`: **0 critical, 7 high, 2 moderate, 2 low**. The high findings are development-tool paths, not production dependencies: `eslint-config-next@15.5.28` → `@next/eslint-plugin-next` → `fast-glob@3.3.1` → `micromatch` → `braces@3.0.3`, and `tailwindcss@3.4.19` → `chokidar@3.6.0` / `fast-glob@3.3.3` → `braces@3.0.3`. The underlying high advisory is GHSA-vfj7-8cjw-p6xm (deeply nested-pattern stack exhaustion). A moderate dev-tree finding, GHSA-rj75-hqrm-r3gf, reaches `postcss-selector-parser@6.1.4` through Tailwind's `postcss-nested`. npm's offered whole-tree fixes require Tailwind 4 or other major changes; those unrelated development-tool upgrades were not taken. No production high/critical finding remains in the final audit.
- `npm ci` succeeded against the updated lockfile. No `npm audit fix --force` was run.

### Durable request idempotency

- Added additive migration [`20261018010000_ai_usage_idempotency.sql`](../supabase/migrations/20261018010000_ai_usage_idempotency.sql) and the corresponding baseline definitions in [`supabase-schema.sql`](../supabase-schema.sql). Migration order is baseline, dashboard indexes, sleep logs, atomic AI usage, idempotent finalization, expired-reservation cleanup, then this request-idempotency migration.
- The new service-role-only `reserve_ai_usage_idempotent` function takes a per-user UUID key, serializes matching calls with a transaction advisory lock, and uses a partial unique index as a second guard. An accepted duplicate returns the original reservation without incrementing quota. Denied reservations do not persist the key. Existing reservation state remains `reserved → committed | released`; finalization remains bounded and retries only the same terminal operation.
- All five API routes require a valid UUID `Idempotency-Key`; an already reserved/handled key returns safe HTTP 409 and never invokes a second provider call. The five browser call paths now use [`metered-ai-fetch.ts`](../src/lib/client/metered-ai-fetch.ts): it stores only a SHA-256 payload fingerprint and UUID in session storage (not request content), reuses the key for matching retries after network errors, 5xx responses, or unreadable success bodies, and retains it after 409 because the original may still be active or ambiguous. A successfully parsed 2xx response clears the key. API results are not persisted or replayed.
- After an ambiguous 409 the same-payload key remains for that browser session, intentionally blocking another identical call; deliberately starting the identical operation again requires a fresh browser session or clearing that session-scoped entry. Different payloads use distinct keys.
- This is bounded request idempotency, **not exactly-once provider execution**. A new UUID intentionally starts a new operation and is still subject to the monthly quota. A client that loses a successful response receives 409 on retry rather than the old result. Provider success followed by permanently unconfirmed commit can still be released by expiry cleanup later; that undercount/cost race cannot be eliminated without durable provider-result/finalization reconciliation.
- Unit tests cover reuse across network/5xx/duplicate outcomes and malformed success bodies. PGlite tests verify duplicate reservation semantics and role restrictions. Real local Postgres/PostgREST tests verify 30 concurrent same-key calls create one reservation, and each of the five route handlers returns 409 on a repeated key without another provider call or usage increment.

### Local 503 reproduction and staging harness

- The original `/tmp/kayven-supabase-local` stack could not start: its persisted migration history did not match its schema; applying `20261015000000_dashboard_indexes.sql` failed because `public.food_logs` was absent. This is a concrete stale-harness problem, but it does **not** establish the cause of the previously reported intermittent REST 503.
- To avoid altering that older test database, created a separate fresh disposable project, `kayven-supabase-blockers`, from the current baseline and ordered migration files. Its API and database use loopback-only ports. The full fresh migration sequence applied and the local integration suites passed.
- Reproduced the prior PostgREST HTTP concurrency test at 30 runs × 25 parallel requests (750 responses). **All 750 returned HTTP 200**; each run allowed exactly five reservations at limit five. A sanitized sample denial body was `[{ "reservation_id": null, "allowed": false, "request_count": 5 }]`. No 503 was reproduced; the original cause remains **unresolved**.
- The disposable PostgREST container had 10 log lines in the inspected window and no error/503 entries. No relevant historic logs were available from the earlier failed run. Do not infer an application or infrastructure root cause from the non-reproduction.
- Real-database tests used the local stack only: PostgreSQL 17, separate connections, local GoTrue JWTs, PostgREST role mapping, mocked external provider fetches. No Anthropic/OpenAI credentials or calls were used. PGlite remains a single-session simulation and is not counted as a concurrency test.

### Final validation evidence

| Check | Result |
|---|---|
| `npm ci` | PASS — 431 packages installed from the current lockfile |
| `npm test` | PASS — billing, RevenueCat, five mocked API route suites |
| `npm run test:sql` | PASS — 18/18 PGlite tests; no concurrent transactions |
| `npm run test:sql:local` | PASS — 17/17 local Postgres/PostgREST tests; includes 750-request REST reproduction |
| `npm run test:metering:local` | PASS — 44/44 real route-to-local-database checks; providers mocked |
| `npx tsc --noEmit --incremental false` | PASS — run after build-generated `.next/types` were ready |
| `npm run lint` | PASS — zero errors; existing hook/ref warnings remain; Next reports `next lint` deprecation |
| `npm run build` | PASS — Next.js 15.5.28, local-only placeholders |
| `git diff --check` | PASS — final worktree |

The final local-stack commands were:

```sh
cd /tmp/kayven-supabase-blocker-verification
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" supabase start
cd /Users/shivakumar/Downloads/macrotrack-main
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
  KAYVEN_SUPABASE_WORKDIR=/tmp/kayven-supabase-blocker-verification \
  KAYVEN_HTTP_RACE_REPEATS=30 npm run test:sql:local
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" \
  KAYVEN_SUPABASE_WORKDIR=/tmp/kayven-supabase-blocker-verification \
  npm run test:metering:local
```

### Remaining blockers and release disposition

- **Fixed and verified:** production Next/PostCSS/Sharp high and critical dependency advisories; request-key reservation idempotency; duplicate route suppression; local fresh migration chain, role restrictions, concurrent accounting, and failure-cost tests.
- **Fixed but not completely verifiable:** finalization may remain ambiguous after bounded retries; same-key retries do not replay results, and provider success with later cleanup release may undercount usage. The safe behavior is fail-closed, not exactly-once.
- **Unresolved / release-blocking:** the original intermittent 503 was not reproduced and has no proven root cause; hosted staging has not been run; deployment host/scheduler and cleanup monitoring remain unconfirmed; external consumers of legacy `record_ai_usage` cannot be ruled out. Confirm those consumers before revoking the service-role grant. The two remaining production audit findings are low severity in Supabase SSR/cookie and still need a planned major upgrade.
- No hosted or production database was accessed, no migration was applied remotely, and no deployment, payment activation, commit, or push was performed. Checkout remains disabled.
