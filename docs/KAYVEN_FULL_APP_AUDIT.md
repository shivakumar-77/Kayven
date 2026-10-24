# Kayven Full App Audit

**Audit date:** 2026-10-22
**Scope:** repository working tree in this workspace, including existing uncommitted changes.
**Overall release status: BLOCKED.** The product has broad working feature coverage and passes its current local build and tests, but a high-severity production dependency advisory, unverified hosted configuration/schema, disabled checkout, and a large uncommitted worktree prevent a production-ready conclusion.

This is a code and local-verification audit, not a certification of the live service. No hosted database, production deployment, provider account, payment, or customer data was accessed as part of this audit. Items labeled “prior verification” come from the repository’s Oct 18 release checklist and were not rerun here.

## Executive Summary

Kayven is a mobile-oriented nutrition and fitness tracker built with Next.js App Router, React, TypeScript, and Supabase. The current working tree includes authentication/onboarding, nutrition logging, AI-assisted food and meal features, coaching, workout tracking, hydration, sleep, supplements, weight and body measurements, progress/gamification, profile settings, subscription screens, and PWA support.

The application is feature-rich but commercial and operational readiness is incomplete. New subscription purchases and trials are intentionally unavailable. RevenueCat synchronization remains for mapped legacy subscriptions; Razorpay order, verification, and webhook routes return `410 Gone`. Local SQL and route tests cover significant behavior, but they do not prove the hosted database, secrets, environment mapping, cron schedule, auth redirects, or provider lifecycle are correctly configured.

## Stack and Architecture

- **Web:** Next.js `15.5.28` App Router, React 18, TypeScript 5, Tailwind CSS 3.4, and custom component styling.
- **Data/auth:** Supabase Auth and Postgres, with user-owned data protected by RLS in the repository schema.
- **AI:** server-side provider adapters for Anthropic/OpenAI configuration; AI Coach, suggestions, food scan, meal plans, and insights use shared quota reservation logic.
- **Billing:** provider-independent subscription mirror, RevenueCat client/server/webhook code for mapped legacy products, and disabled Razorpay endpoints.
- **Client capabilities:** responsive/mobile navigation, browser storage, service-worker registration, PWA manifest, Vercel Analytics integration, and theme support.
- **Hosting assumptions:** Vercel and Supabase appear in project configuration and prior operational notes. Current production-to-database mapping was not verified in this audit.

Key ownership boundaries are under `src/app` (pages and API routes), `src/components` (shared UI), `src/lib` (business logic and integrations), and `supabase` plus `supabase-schema.sql` (database baseline and migrations).

## What Is Built

| Area | Current implementation | Audit status |
|---|---|---|
| Authentication | Supabase sign-in page, OAuth callback, session-aware home routing, and onboarding. | Implemented; signed-in hosted flows not verified. |
| Dashboard | Daily nutrition/hydration overview, progress surfaces, and user-specific data. AI suggestions are now explicitly requested rather than automatically consuming quota on dashboard load. | Implemented; live data persistence not verified here. |
| Nutrition | Food log, meal/calorie views, bundled food search with external lookup paths, favorites/history, barcode lookup, and image-based food scan. | Implemented; AI scan is authenticated and metered. Provider behavior is mocked in route tests. |
| AI Coach | Conversational interface, local intelligence/tools, context/memory support, and external provider fallback. | Implemented; external generation uses shared quota path. Real provider behavior/quality is not certified. |
| Suggestions and meal plans | User-triggered nutrition suggestions and generated meal plans, with validation and plan entitlement checks. | Implemented; generation is metered. No live-provider QA performed. |
| Insights and health | Weekly progress insights, health-agent view, next-action and intelligence/context APIs. | Implemented in code; advanced insights have entitlement and quota checks. Health advice requires product/legal review. |
| Workout | Exercise library, templates, active workout/session flow, history, body view, and personal-record/progress support. | Implemented; signed-in persistence was not tested in this session. |
| Tracking | Water, weight, sleep, supplements, and body measurements, including history screens. | Implemented; sleep depends on its migration. Hosted persistence is unverified. |
| Progress and engagement | Achievements, streaks, weekly challenges, progress analytics, and shareable progress cards. | Implemented; weekly challenge calculations have regression tests. |
| Profile/settings | Goals/profile, theme and reminder settings, subscription entry, privacy/data controls, support, and Terms/Privacy copy. | Implemented; legal content and any business/company claims are not verified. |
| Plans/subscriptions | Free/Basic/Standard plan display, informational pricing, feature entitlements, status and management screen. | Display/status paths implemented; new checkout, trials, cancellation portal, and payment history are incomplete or disabled. |
| PWA/notifications | Web manifest, offline page, service worker registration, notification/reminder UI. | Scaffolded; push delivery, offline behavior, and device-specific notification permissions are not certified. |

### Plan configuration

The central plan configuration currently marks Free, Basic, and Standard active; Premium and Pro are inactive legacy plans. Configured AI request limits are Free 10, Basic 100, Standard 100, Premium 100, and Pro 300 per monthly period. Trial eligibility is false for every plan. Plan prices are informational; the UI clearly disables checkout. No active plan has a verified new-purchase product mapping.

## Current Route Inventory

### User-facing pages

- **Entry and identity:** `/`, `/auth`, `/auth/callback`, `/onboarding`
- **Home and nutrition:** `/dashboard`, `/log`, `/calories`, `/meal-plan`, `/calorie-calc`, `/bmi`
- **Coaching and analysis:** `/coach`, `/insights`, `/progress`, `/share`
- **Health tracking:** `/water`, `/weight`, `/sleep`, `/measurements`, `/supplements`, `/supplements/add`, `/supplements/history`
- **Training:** `/workout`, `/workout/active`, `/workout/body`, `/workout/exercises`, `/workout/history`, `/workout/template`
- **Account and product:** `/profile`, `/subscription`, `/subscription/manage`, `/notifications`

### API routes

- **AI and food:** `/api/ai-scan`, `/api/barcode`, `/api/coach`, `/api/health-agent`, `/api/insights`, `/api/intelligence/context`, `/api/meal-plan`, `/api/meal-search`, `/api/memories`, `/api/next-action`, `/api/suggestions`
- **Subscription:** `/api/subscription`, `/api/subscription/refresh`, `/api/create-order`, `/api/verify-payment`
- **Webhooks/operations:** `/api/webhooks/razorpay`, `/api/webhooks/revenuecat`, `/api/internal/ai-reservations/cleanup`

The route inventory was cross-checked against the current source tree and the Oct 22 production build output.

## Data and Integrations

### Repository database model

The Oct 18 clean local replay recorded 20 public tables across the baseline and migrations. They cover profiles, food and weight logs, conversations/messages/memories, subscriptions, AI usage/reservations, webhook event idempotency, sleep logs, achievements, exercise PRs, measurements, streaks, supplements and supplement logs, water logs, workout logs, and workout templates. Nine app-owned relations were added with user ownership, grants, indexes, and RLS policies in `20261018020000_app_data_tables.sql`.

The current migration set contains the dashboard indexes, sleep logs, atomic AI usage, idempotent reservations, orphan-reservation cleanup, request idempotency, and app data tables. The baseline schema and migrations passed a fresh local replay according to the Oct 18 checklist. **This does not establish compatibility with a hosted database. Do not replay the full schema against an existing hosted database.** Inspect its schema, data, grants, RLS, and migration history first and make a target-specific plan.

### External services

- **Supabase:** authentication, user data, RLS, service-role-only billing/quota operations.
- **AI providers:** Anthropic and OpenAI configuration; secrets must remain server-only.
- **Food data:** bundled database with external food/barcode lookup integrations.
- **RevenueCat:** legacy product/customer sync, server refresh, and authorized webhook processing.
- **Razorpay:** configuration remains, but purchase/order/verification/webhook paths are disabled.
- **Vercel:** analytics package is included. A prior browser smoke test reported its script blocked by the current Content Security Policy.

## AI Quota and Billing Assessment

The five metered AI surfaces are Coach, insights, suggestions, AI food scan, and meal plan. They authenticate, validate payloads, require an idempotency key, reserve quota before provider execution, then commit usable results or release non-billable failures. Server-side failures fail closed; the local route tests mock AI providers and Supabase. A cleanup RPC and endpoint exist for orphaned reservations, but no production schedule is configured or verified.

New checkout is deliberately off:

- `/api/create-order`, `/api/verify-payment`, and `/api/webhooks/razorpay` respond `410 Gone`.
- Plan cards are informational and their checkout buttons are disabled.
- RevenueCat code handles mapped legacy products, but the current plan UI does not connect to a verified new-sales product mapping.
- No seven-day trial, provider-backed cancellation action, in-app plan changes, or payment history is available.

This is the correct fail-closed behavior until the provider, product IDs, ownership mapping, billing terms, and lifecycle events have been validated end-to-end.

## Quality and Verification

### Checks run for this audit

| Check | Result | Scope |
|---|---|---|
| `npm test` | PASS | Billing, RevenueCat, AI route, challenge, and food-search checks using local/mocked dependencies. |
| `npm run test:sql` | PASS, 21/21 | PGlite SQL tests; single-session coverage, not concurrent database transactions. |
| `npx tsc --noEmit --incremental false` | PASS | Standalone full-project TypeScript check. |
| `npm run lint` | PASS with 17 warnings | No lint errors. `next lint` is deprecated; warnings are React effect dependencies and one ref cleanup. |
| `npm run build` | PASS | Next.js 15.5.28; 42 static pages generated. Same 17 lint warnings were reported. |
| `npm audit --omit=dev` | **FAIL: 1 high** | Current lockfile contains vulnerable `follow-redirects@1.16.0`; npm reports a non-major fix is available. |
| `npm audit` | **FAIL: 10 advisories** | 8 high and 2 moderate across production and development/build dependencies. Tailwind-related fixes proposed by npm require a major Tailwind 4 migration. |

### Prior local verification, not rerun here

The Oct 18 release checklist records a fresh disposable Supabase migration replay, 18/18 local Postgres/PostgREST tests, 44/44 local app-to-Supabase metering tests, five repeated quota-race runs, and a clean production-only dependency audit at that time. Those are useful prior results, but the current npm audit differs and the hosted environment remains unverified.

## Findings and Risks

### P0 — Resolve before production release

1. **High production dependency advisory.** Current `npm audit --omit=dev` reports high severity in `follow-redirects@1.16.0`. Apply a reviewed compatible update and rerun install, audit, tests, typecheck, lint, and build. Do not use `npm audit fix --force` for the Tailwind-related findings without a planned major migration.
2. **Hosted environment and schema are not certified.** Current Vercel-to-Supabase mapping, hosted migration state, RLS/privileges, service-role configuration, OAuth redirect configuration, and production cron are not verified by local tests. Prior Oct 18 notes reported missing server-only variables in the visible Vercel listing; reconfirm in the intended environment without exposing secret values.
3. **Worktree is not a release snapshot.** The current workspace contains many modified tracked files and untracked implementation/docs/tests. This audit describes the working tree; build success does not prove the changes are committed, reviewed, or reproducible from the intended release revision.
4. **Commercial flows are incomplete.** Checkout is disabled; do not advertise paid activation, trials, cancellation, refunds, or payment history until provider ownership and lifecycle behavior are verified.

### P1 — Address before broad launch

1. **Database setup instructions conflict.** `README.md` tells operators to paste `supabase-schema.sql` into SQL Editor, while the production checklist correctly warns against replaying the baseline on an existing database. Update setup instructions to use a reviewed, target-specific migration process.
2. **Development dependency advisories remain.** Full audit reports 10 findings total. The Tailwind/PostCSS chain has high/moderate findings whose suggested npm fix jumps to Tailwind 4. Plan and test that toolchain migration separately; do not force-upgrade during a release fix.
3. **AI cleanup is unscheduled.** The cleanup endpoint and secret checks exist, but orphaned reservations can continue consuming quota until a trusted schedule runs. Configure and monitor a host-supported schedule after the database function is verified on staging.
4. **Accessibility and browser policy need review.** The root viewport sets `maximumScale: 1` and `userScalable: false`, preventing user zoom. The Content Security Policy includes `unsafe-inline` and `unsafe-eval`; analytics was previously blocked under that policy. Review zoom support and replace broad script allowances with a tested nonce/hash policy where feasible.
5. **Legal/health content is not approved.** Existing Terms/Privacy copy and nutrition/health guidance need business/legal review. Do not treat repository text as verified medical, privacy, cancellation, refund, or company disclosures.

### P2 — Improve quality and operations

- Fix or consciously accept the 17 React-hook/ref warnings and migrate off deprecated `next lint`.
- Run signed-in browser QA at mobile, tablet, and desktop sizes; verify logging failure/retry behavior, account switching, session expiry, and RLS with disposable users.
- Test RevenueCat webhook duplicates, ordering, cancellation/expiration/refund semantics, and provider outage behavior in a sandbox before relying on paid entitlements.
- Verify PWA offline behavior, notification permissions/delivery, analytics loading, and CSP in the target browser/device matrix.
- Align `README.md`, the Oct 18 release checklist, and the new full audit after dependency/environment rechecks; their prior production audit numbers are stale.

## Recommended Work Order

1. Save a clean, reviewable release snapshot and confirm the intended branch/revision.
2. Resolve the production `follow-redirects` advisory with a compatible lockfile update; rerun all local checks and the dependency audit.
3. Align installation documentation with migration safety. Verify migration history and schema on an approved isolated staging project, not production.
4. Verify server-only environment configuration, Vercel-to-Supabase mapping, OAuth callbacks, AI cleanup scheduling, monitoring, and rollback procedure.
5. Perform signed-in end-to-end browser tests with disposable accounts and provider sandboxes; keep checkout disabled until account-linked purchase and lifecycle behavior passes.
6. Obtain business/legal approval for plan prices, terms, privacy copy, medical claims, and release disclosures.

## Audit Sources

- Current implementation: `src/app`, `src/components`, `src/lib`, `supabase-schema.sql`, and `supabase/migrations`.
- Current checks: commands recorded in the Quality and Verification section above.
- Prior operational evidence and detailed migration/environment notes: [PRODUCTION_RELEASE_CHECKLIST.md](./PRODUCTION_RELEASE_CHECKLIST.md).
- Prior feature implementation log: [KAYVEN_IMPLEMENTATION_REPORT.md](./KAYVEN_IMPLEMENTATION_REPORT.md).
- Historical Oct 17 snapshot: [KAYVEN_CURRENT_STATE_AUDIT.md](./KAYVEN_CURRENT_STATE_AUDIT.md).