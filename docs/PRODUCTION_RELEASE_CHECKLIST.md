# Kayven production release checklist

**Last repository review:** 2026-10-18
**Release status: BLOCKED.** The repository now contains the missing application data schema, and a clean local Supabase replay plus application/RLS tests pass. Hosted environment mapping and migration compatibility remain unverified; required server-only variables were absent from the last safe Vercel listing, and development/build-tool audit findings remain. No hosted database or production setting was changed.

Status labels below mean **PASS** = directly verified, **FAIL** = a checked requirement is unmet, **BLOCKED** = cannot safely proceed under current constraints, and **NOT VERIFIED** = evidence is unavailable.

## Release gates

| Gate | Status | Evidence |
|---|---|---|
| Clean baseline + migrations on disposable local Postgres | **PASS** | Current `supabase-schema.sql` plus all seven timestamped migrations applied; local history recorded eight versions including the baseline. |
| AI quota, idempotency, concurrency, cleanup authorization | **PASS** | Fresh local Postgres/PostgREST suite passed 18/18; app-to-local-Supabase suite passed 44/44 with provider calls mocked. |
| Application schema completeness | **PASS (local only)** | Clean schema contains 20 public tables, including all nine user-owned app data tables. Actual hosted schemas/data were not inspected. |
| Production dependency audit | **PASS** | `npm audit --omit=dev` reports zero vulnerabilities after updating `@supabase/ssr`. |
| Full dependency audit | **BLOCKED** | Nine remaining findings are in development/build-tool dependency paths; available fixes require a major toolchain upgrade. |
| Hosted staging | **NOT VERIFIED** | Only two hosted Supabase projects are available and neither was used or modified. |
| Production release | **BLOCKED** | Required server environment variables, hosted schema/migration compatibility, Vercel-to-Supabase mapping, hosted staging, and residual development-tool advisories remain unresolved. |
| Razorpay payments | **PASS (disabled)** | Order, verification, and webhook endpoints return HTTP 410; subscription checkout UI remains disabled. No transaction was initiated. |

## Confirmed completed locally

- Shared, server-side AI quota reservation, idempotency, commit/release, and expiry cleanup are present. The local metering test harness exercises all five AI routes with mocked provider calls.
- `supabase-schema.sql` and the migration files contain the AI reservation and cleanup system. See [Migration order and database safety](#migration-order-and-database-safety).
- Next.js server `cookies()` calls use the asynchronous API.
- The Razorpay create-order, payment-verification, and Razorpay-webhook routes return HTTP 410. The subscription plan page disables checkout. Razorpay is the user-selected provider, but do not enable these routes or their UI before payment verification is complete.
- The RevenueCat client/server and webhook code are present, but the purchase helper is not connected to the plan UI. Repository configuration alone does not prove provider-account setup.
- Fixed the baseline subscription normalization so valid `basic` and `standard` rows are preserved. Added a PGlite check that executes that statement against representative rows.
- Fixed RevenueCat `UNCANCELLATION` status normalization to restore active status, with a regression test.
- Removed Next.js build settings that suppressed build-time TypeScript and lint checks.
- Split the cleanup secret onto its own line in `.env.example`.
- Started the existing disposable local Supabase project `kayven-supabase-blockers` without resetting it, ran both local integration suites, and stopped the stack afterward.
- The local SQL suite used real Postgres connections, GoTrue-issued JWTs, and PostgREST role mapping. The local application suite ran the actual five AI route handlers and metering code against local Auth/PostgREST/database RPCs; provider calls were intercepted and mocked.
- Added nine app data tables with explicit user ownership, foreign keys, indexes, authenticated grants, anon revokes, and RLS policies. Supplement logs enforce that the referenced supplement belongs to the same user.
- Removed undeclared relation dependencies: coaching reads target fields from `profiles`; meal search uses the bundled `FOOD_DATABASE`; weekly challenges derive progress from existing user logs. Corrected the profile-completion check to use `profiles.phone_number`.
- Added challenge-progress and meal-search regression tests, PGlite schema/grant/RLS metadata checks, and local Postgres cross-user RLS tests.
- A newly initialized local-only project applied the current baseline and all seven timestamped migrations; the migration table recorded eight versions, and the resulting database had 20 public tables. The stack was stopped after testing. No hosted reference/link metadata was used.
- Repeated the local PostgREST HTTP quota race five times (25 concurrent requests per run): all 125 responses were HTTP 200. The previously reported 503 did not reproduce; its original root cause remains undetermined, and there was no failing response body or corresponding PostgREST error log to inspect.
- Updated `@supabase/ssr` from `^0.1.0` to `^0.6.1` to remove the active production `cookie` advisory. The resolved `cookie` version is `1.1.1`; `@supabase/supabase-js@2.101.1` satisfies the new package peer range. Unit, local integration, type, lint, and build checks were run after the change.

## Current local checks

| Check | Result |
|---|---|
| `npm ci` | **PASS** — clean install in a disposable full-source copy. npm reported nine development advisories and warned that install scripts for `fsevents` and `unrs-resolver` were not covered by the environment's `allowScripts` policy; clean-copy lint and build still passed. |
| `npm test` | **PASS** — existing billing, RevenueCat, mocked AI route checks plus weekly challenge and static food-search regressions. |
| `npm run test:sql` | **PASS** — 21/21 PGlite tests. This is single-session coverage; concurrent transaction coverage is from local Postgres below. |
| `supabase db reset --local` (fresh isolated project) | **PASS** — current baseline plus all seven timestamped migrations applied from an empty local database; eight versions recorded. Result: 20 public tables, including all nine required app data tables. No hosted reference/link metadata was used. |
| `npm run test:sql:local` | **PASS** — 18/18 on fresh local Postgres/PostgREST, including app-table owner isolation, separate-connection quota races, idempotency, cleanup races, RLS/function permissions, period boundaries, and underflow checks. The HTTP concurrency case passed 5 repetitions (125/125 status 200); the earlier 503 was not reproduced, so no root cause is claimed. |
| `npm run test:metering:local` | **PASS** — 44/44 using the actual five AI route handlers and real local Auth/PostgREST/database RPCs; provider calls were mocked. Includes ambiguous RPC outcomes, duplicate keys, failure/retry handling, cleanup recovery, and user isolation. |
| `npx tsc --noEmit --incremental false` | **PASS** — standalone TypeScript validation. |
| `npm run lint` | **PASS** — zero errors; 17 warnings and the Next.js `next lint` deprecation notice remain. |
| `npm run build` | **PASS** — Next.js 15.5.28 with local-only placeholder values; build lint/type validation also passed. |
| `npm audit --omit=dev` | **PASS** — zero vulnerabilities after the SSR update. |
| `npm audit` | **BLOCKED** — nine development/build-tool findings remain (7 high, 2 moderate); see [Dependency security](#dependency-security). |
| `git diff --check` | **PASS** |

The fresh migration and integration tests used `/tmp/kayven-release-check-vQRie9`, with a new local-only project ID. The stack was stopped afterward. Both integration scripts refuse non-loopback targets. No hosted project was contacted by the tests.

## Dependency security

- **Fixed and verified:** `@supabase/ssr` was upgraded from `0.1.0` to `0.6.1`. The production path previously resolved `cookie@0.5.0`, affected by low-severity GHSA-pxg6-pf52-xh8x (`cookie <0.7.0`). Version `0.6.1` resolves `cookie@1.1.1` and accepts the installed `@supabase/supabase-js@2.101.1` peer range. Unit tests, local Supabase route tests, standalone TypeScript, lint, and build passed after the update. `npm audit --omit=dev` now reports zero findings.
- **Blocked — high, development/build tooling only:** GHSA-vfj7-8cjw-p6xm affects installed `braces@3.0.3` (reported range `<=3.0.3`) through `tailwindcss@3.4.19` and `eslint-config-next@15.5.28`/`@next/eslint-plugin-next@15.5.28`, via `chokidar`, `fast-glob`, and `micromatch`. The configured registry reports `braces@3.0.3` as current and returns 404 for `braces@3.0.4`; npm's proposed fix is Tailwind CSS `4.3.3`, a major upgrade. No compatible patch override was applied.
- **Blocked — moderate, development/build tooling only:** GHSA-rj75-hqrm-r3gf affects installed `postcss-selector-parser@6.1.4` (reported range `<7.1.6`) through `postcss-nested@6.2.0` and Tailwind CSS 3. `postcss-selector-parser@7.1.6` is available but is outside the current v6 dependency range; npm's proposed fix is Tailwind CSS `4.3.3`, a major upgrade. No cross-major override was applied.
- The full `npm audit` reports nine package findings (7 high, 2 moderate) aggregated under those two advisories. They are development dependencies, not production runtime dependencies, but remain a build-tool supply-chain risk. A Tailwind 4 / ESLint toolchain migration must be planned and tested separately before accepting that risk for CI builds. No `npm audit fix --force` was used.
- Tailwind 4 would require a deliberate PostCSS/CSS/config migration: the current setup uses Tailwind 3's `tailwindcss` PostCSS plugin, legacy `@tailwind` CSS directives, and a v3 config. The app build currently passes on v3; a major toolchain conversion was not judged safe as an incidental fix.

## Environment variables

Configure values in the verified hosting environment only. Never copy secret values into this checklist, source control, browser-visible variables, or logs.

### Read-only hosting/environment audit

- Local `.env.local` identifies `ykalxwedmzlbrqxbrfay`, user-confirmed as the development Supabase project. Whether it contains production users or other real data was not verified; treat its data as real and do not use it for staging tests.
- Generated Supabase CLI metadata at `supabase/.temp/linked-project.json` also identifies `ykalxwedmzlbrqxbrfay`. The repository has no `supabase/config.toml`; the linked metadata was not used for local testing. The clean test used a separate `supabase init` workdir with no linked-project metadata.
- Vercel CLI previously identified project `kayven` as a Next.js project with build command `npm run build`. Recent deployment metadata included production-target deployments on `main` and preview deployments with no production target. The project inspection did not disclose a repository identity or configured production-branch setting. No repository `.vercel/project.json` or `vercel.json` is present.
- The visible Vercel environment listing showed `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `ANTHROPIC_API_KEY` scoped to Production, Preview, and Development. The Supabase URL value is encrypted; its project ref could not be safely derived or compared with `ykalxwedmzlbrqxbrfay`. Do not run mutating tests from a Vercel Preview deployment until its Supabase target is verified.
- `SUPABASE_SERVICE_ROLE_KEY`, `AI_CLEANUP_SECRET`, and `CRON_SECRET` were not present in the visible Vercel environment-variable listing. AI reservation/finalization and scheduled cleanup are not release-ready until the correct server-only values are configured and verified in the intended environment.
- `KAYVEN_AI_PROVIDER` and `ANTHROPIC_MODEL` were listed for Production only. Keep provider credentials server-only; configure isolated test credentials or disable provider calls in Preview/Development to avoid unexpected provider charges.
- Production-only variable names visible in Vercel included `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`, as well as provider/food-data settings. Their presence does not activate payment processing: the Razorpay routes remain disabled and the UI checkout remains disabled. Do not use these credentials or perform real transactions.
- The Vercel environment listing exposed names and scopes only; no values, API keys, or credentials were displayed.
- A fresh attempt to list Vercel variables during this review did not produce safely parseable names/scopes and was discarded; the scope statements above rely on the earlier names-only review. Reconfirm in the Vercel dashboard without opening or sharing values before production.

### Core application

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never prefix with `NEXT_PUBLIC_`
- `KAYVEN_AI_PROVIDER`
- One configured server-side provider key as selected by `KAYVEN_AI_PROVIDER`: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Optional provider model settings: `ANTHROPIC_MODEL`, `OPENAI_MODEL`
- Optional food lookup: `USDA_API_KEY`
- Ensure `KAYVEN_DEV_PLAN` and `KAYVEN_DEV_USER_ID` are unset in production.

### AI reservation cleanup

- Configure `AI_CLEANUP_SECRET` or the hosting platform's verified `CRON_SECRET`; both are server-only.
- Optional `AI_RESERVATION_EXPIRY_MINUTES` (default 15; values below the five-minute safety floor fail closed).
- No schedule is currently configured or verified.

### RevenueCat, only if selected as the subscription provider

- Client: `NEXT_PUBLIC_REVENUECAT_WEB_API_KEY`
- Product IDs, configured consistently on client and server:
  - `NEXT_PUBLIC_REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID`
  - `NEXT_PUBLIC_REVENUECAT_PREMIUM_YEARLY_PRODUCT_ID`
  - `NEXT_PUBLIC_REVENUECAT_PRO_MONTHLY_PRODUCT_ID`
  - `NEXT_PUBLIC_REVENUECAT_PRO_YEARLY_PRODUCT_ID`
  - `REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID`
  - `REVENUECAT_PREMIUM_YEARLY_PRODUCT_ID`
  - `REVENUECAT_PRO_MONTHLY_PRODUCT_ID`
  - `REVENUECAT_PRO_YEARLY_PRODUCT_ID`
- Server: `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`
- Optional mapping/API settings: `REVENUECAT_API_BASE_URL`, `REVENUECAT_PREMIUM_ENTITLEMENT_ID`, `REVENUECAT_PRO_ENTITLEMENT_ID`
- RevenueCat is not the selected provider for this release; its configuration is listed only as existing repository scaffolding and must not be mixed with Razorpay configuration.

### Razorpay

Razorpay is currently disabled. Its existing variables (`NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) are not sufficient to make checkout safe. Do not configure or use them until order creation and subscription verification are implemented, sandbox tests pass, and provider dashboard settings are verified.

`REDIS_URL` is referenced only by the unimported `src/lib/rate-limiter.ts`; it is not a confirmed active production dependency. `NEXT_PUBLIC_SITE_URL` is documented in `.env.example` but was not found in active source references.

## Migration order and database safety

### Supabase target identification

- The local `.env.local` Supabase project identifier matches the user-provided ref `ykalxwedmzlbrqxbrfay`. No URL or credential value was displayed.
- Generated Supabase CLI metadata at `supabase/.temp/linked-project.json` contains the same non-secret project ref. No repository `supabase/config.toml` is present. The local replay used a separately initialized workdir without linked-project metadata and explicit `--local`/`--workdir` flags.
- The project settings page redirected to Supabase sign-in. The user subsequently confirmed this project is **development**; that classification is user-confirmed, not independently visible in the dashboard. It is not the staging target.
- After that confirmation, `supabase migration list --project-ref ykalxwedmzlbrqxbrfay` was run read-only. The CLI listed the six repository migration versions with blank remote-version fields and returned “Migrations listed.” This means no remote migration version was recorded in that response; it does **not** prove the database schema is empty or that the manually applied baseline is absent.
- No hosted database schema query, migration application, or data modification was performed. Schema queries and migration replay were confined to the disposable local project.

The repository schema README describes applying `supabase-schema.sql` manually. The migration files alone do not prove that any target database has applied them.

For a **fresh disposable database**, the dependency order is:

1. `supabase-schema.sql` — baseline tables, policies, billing tables, and functions.
2. `supabase/migrations/20261015000000_dashboard_indexes.sql` — depends on baseline food/weight tables; the water index is conditional for older baselines. It is a timestamped migration and Supabase CLI will apply it; review the ordinary (non-concurrent) index creation against target table sizes before hosted application.
3. `supabase/migrations/20261017000000_sleep_logs.sql` — creates/updates sleep log structures; baseline also defines this table.
4. `supabase/migrations/20261017001000_atomic_ai_usage.sql` — AI quota reservations; depends on baseline profile and usage tables.
5. `supabase/migrations/20261017002000_idempotent_ai_usage_reservations.sql` — reservation finalization behavior.
6. `supabase/migrations/20261018000000_expire_orphaned_ai_reservations.sql` — privileged cleanup function.
7. `supabase/migrations/20261018010000_ai_usage_idempotency.sql` — request-key reservation idempotency.
8. `supabase/migrations/20261018020000_app_data_tables.sql` — app-owned achievements, measurements, streaks, supplements, hydration, and workout relations with RLS and grants.

Fresh replay verification: the current `supabase-schema.sql` was copied as the first migration in a newly initialized local-only Supabase project, followed by all seven timestamped migrations above. `supabase db reset --local` succeeded; the database recorded eight versions including the baseline and contained 20 public tables. The result includes all nine app data tables, and local Postgres tests verified RLS isolation.

This list is **not** an instruction to apply these files to an existing or hosted database. The baseline normalization preserves recognized plan IDs, but a full baseline re-application is still not approved: it drops/recreates policies and a trigger, alters constraints, and normalizes unknown plan IDs. The sleep-log migration repeats a baseline table/index definition and replaces its policy; this is idempotent on a fresh database and passed replay, but does not make full baseline reapplication safe. The new app-data migration uses `CREATE TABLE IF NOT EXISTS`; it does not retrofit constraints on a pre-existing relation with the same name. Inspect any existing target relations, constraints, grants, RLS policies, and data before planning or applying it. Obtain the target's migration history and schema first, then produce a target-specific additive plan and review it.

The dashboard-index migration previously had a “for review only” header despite being inside `supabase/migrations/`, where Supabase CLI treats it as active. The header is now accurate: it is part of the replay and was tested locally, but its ordinary index creation still requires target-size/lock review before any hosted use.

Do not use a production database for migration testing. Do not reset, drop, or recreate a hosted database. Hosted staging remains unverified.

### Database schema completeness

**PASS — repository schema completeness on a fresh local database.** The current baseline plus migrations creates the nine user-owned relations used by active app code: `achievements`, `exercise_prs`, `measurements`, `streaks`, `supplement_logs`, `supplements`, `water_logs`, `workout_logs`, and `workout_templates`. Local tests verify that each has RLS enabled, authenticated access is granted, anon access is revoked, and user B cannot read user A's rows or write as user A. A composite foreign key also prevents a user's supplement log from pointing at another user's supplement.

The three other prior undeclared references were removed rather than modeled as duplicate database structures: coach profile targets now read from existing `profiles`; `/api/meal-search` searches the bundled `FOOD_DATABASE` and retains the OpenFoodFacts/USDA fallback; weekly challenge progress is derived from existing food, workout, water, and weight logs. These changes have regression tests.

**Hosted schema remains NOT VERIFIED.** The local replay cannot establish whether either hosted project already contains any of these relations or whether its columns, data, constraints, privileges, and policies are compatible. The baseline must not be replayed against an existing database. The new table migration's `IF NOT EXISTS` clauses do not retrofit constraints on an existing table; perform a read-only target-specific schema/data preflight before any hosted migration.

## Payment readiness

- Razorpay endpoints currently return 410 and the plan UI is disabled; there is no active Razorpay order, verification, or webhook processing.
- RevenueCat has client purchase helpers, server refresh, subscription synchronization, and a webhook endpoint. No current plan UI calls the purchase helper, and the configured product mappings support `premium`/`pro` while those plans are inactive in `PLANS`.
- Razorpay is selected by the user, but no provider account, sandbox credentials, subscription plan IDs, merchant verification, webhook configuration, or test/live mode separation was verified.
- The attempted fetches of official Razorpay documentation were blocked by the available web-fetch capability. No endpoint or signature behavior has been inferred from those failed fetches; consult current official Razorpay documentation before implementing or enabling payment APIs.
- Before enabling any checkout, confirm Razorpay plan/SKU mapping without changing published prices or quotas. Test verified purchase, invalid signatures/authorization, mismatched product/user, duplicate and out-of-order events, cancellation, expiration, refunds/chargebacks where supported, and provider outages against sandbox only.
- The RevenueCat webhook currently records and applies events through separate database operations. Duplicate/out-of-order behavior under concurrent delivery needs targeted tests and review before payment activation.
- Never grant paid entitlements from client-reported payment status. Never run a real charge as a smoke test.

## Hosting, scheduling, deployment, and rollback

- Vercel project `kayven` is accessible read-only through the CLI and has production and preview deployment targets. The configured Supabase URL's project ref remains unverified, so Preview may share the Production database target. Confirm the mapping in the Vercel dashboard using identifiers only; do not share or copy environment values.
- There is no repository `vercel.json`, Supabase CLI config, GitHub Actions deployment workflow, or linked `.vercel/project.json`.
- Docker Desktop 29.8.2 and Supabase CLI 2.121.0 are available. Local Supabase is the safe staging substitute for schema, auth/RLS, PostgREST, quota/concurrency, and mocked-provider integration tests. It cannot certify the hosted project's configuration, OAuth callbacks, network policy, Vercel environment mapping, or live provider setup.
- Recreate a clean local test database without using the repository's linked Supabase metadata:
  ```sh
  export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
  export KAYVEN_SUPABASE_WORKDIR="$(mktemp -d /tmp/kayven-clean-XXXXXX)"
  supabase init --workdir "$KAYVEN_SUPABASE_WORKDIR" --yes
  mkdir -p "$KAYVEN_SUPABASE_WORKDIR/supabase/migrations"
  cp supabase-schema.sql "$KAYVEN_SUPABASE_WORKDIR/supabase/migrations/20260101000000_baseline.sql"
  cp supabase/migrations/*.sql "$KAYVEN_SUPABASE_WORKDIR/supabase/migrations/"
  : > "$KAYVEN_SUPABASE_WORKDIR/supabase/seed.sql"
  supabase start --workdir "$KAYVEN_SUPABASE_WORKDIR"
  supabase db reset --local --workdir "$KAYVEN_SUPABASE_WORKDIR" --yes
  npm run test:sql:local
  npm run test:metering:local
  supabase stop --workdir "$KAYVEN_SUPABASE_WORKDIR"
  ```
  Both test scripts refuse non-loopback database/API targets. The repository has no `supabase/config.toml`; never run this from the repository's linked project directory or against a hosted project. `db reset` is safe here only because the workdir was newly created and explicitly local.
- No cron schedule is present. The cleanup endpoint accepts an authenticated GET or POST with a server-only `AI_CLEANUP_SECRET` or `CRON_SECRET`, checks a minimum secret length, enforces a five-minute threshold floor, and returns a sanitized result. Configure a scheduler only after confirming the host, supported schedule syntax, secret delivery, and monitoring.
- No third hosted project is available. Do not treat either existing hosted project (the application project or the website project) as a staging database without verifying its role/data and obtaining explicit approval. Under the current no-hosted-modification constraint, hosted staging remains unverified.
- Before deployment: confirm the production Vercel-to-Supabase mapping and environment scopes; configure required server-only values by name; confirm OAuth redirect/callback URLs and HTTPS/custom domain; verify migration history; complete the remaining staging checks using an approved environment; and obtain approval for any production migration, payment activation, or deployment.
- Staging sequence: deploy a reviewed build to the confirmed staging target; verify sign-up/login/logout/session persistence, reads/writes, AI auth/quota/isolation with mocked or approved sandbox providers, payment sandbox/webhook cases, cleanup auth and schedule, and mobile navigation. Do not make real charges.
- Production sequence, only after all gates and explicit approvals: apply the reviewed target-specific migration plan; deploy the approved build; verify the deployment identifier and health; run read-only authentication/subscription smoke checks; verify webhook delivery without initiating a real charge; monitor errors and cleanup execution.
- Rollback: if the hosting platform is confirmed as Vercel, use its deployment rollback/promote-previous-deployment facility after confirming the exact project and deployment. Keep checkout disabled. Do not automatically reverse database changes; use a reviewed forward-fix unless an approved migration-specific rollback has been tested. Recheck subscription records, AI accounting, and webhook delivery after rollback.

## Remaining blockers / required evidence

1. **BLOCKED — server configuration:** `SUPABASE_SERVICE_ROLE_KEY`, `AI_CLEANUP_SECRET`/verified `CRON_SECRET`, and their intended environment scopes were absent from the prior safe Vercel listing. Configure from the appropriate secret manager only after verifying the target; never share the values.
2. **NOT VERIFIED — environment mapping:** identify the Supabase project ref used by Vercel Production and Preview without revealing URLs or keys. Prevent Preview/Development from making real provider calls or use isolated provider credentials.
3. **NOT VERIFIED — hosted schema and migration history:** inspect the intended application's existing relations, data, grants, policies, and migration history read-only. Do not apply the baseline. Review the active dashboard index migration's lock impact and confirm whether the existing app relations already match the new migration before planning any hosted change.
4. **BLOCKED — hosted staging:** there is no third hosted project and no hosted project was approved or modified for staging. Local verification does not certify hosted auth redirects, OAuth, network policies, Vercel mapping, or production data safety.
5. **BLOCKED — residual development audit:** nine findings (7 high, 2 moderate) remain in build tooling. Complete and verify a Tailwind 4/PostCSS/ESLint migration, or explicitly accept the bounded CI/build-tool risk before release.
6. **NOT VERIFIED — cleanup operation:** configure a supported monitored schedule and validate secret delivery/alerts in the confirmed production host.
7. **NOT VERIFIED — payments:** obtain Razorpay sandbox setup and verify the subscription/webhook lifecycle only after implementation. Keep the currently disabled endpoints and UI disabled; do not run real transactions.
8. **NOT VERIFIED — operational release controls:** verify OAuth redirects, custom domain/HTTPS, rollback process, monitoring, and incident response for the selected production target.
9. **BLOCKED — release approval:** no production data change, hosted migration, production environment change, deployment, commit/push, or payment activation was performed or approved.

No hosted database was queried or modified in this continuation; no hosted migration, production environment change, deployment, payment activation, real transaction, commit, or push was performed.
