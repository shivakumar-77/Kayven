# Kayven Current-State Audit

> **Superseded:** this is the Oct 17 snapshot. See [KAYVEN_FULL_APP_AUDIT.md](./KAYVEN_FULL_APP_AUDIT.md) for the consolidated audit of the current working tree as of 2026-10-22.

Audit date: 2026-10-17

This audit reflects the repository after the implementation and readiness
verification recorded in [`KAYVEN_IMPLEMENTATION_REPORT.md`](./KAYVEN_IMPLEMENTATION_REPORT.md).
Database migrations and provider flows are reported as unverified unless they
were exercised against their configured test environments. No live migration
or payment was attempted.

## Current state

- The app remains a Next.js 14.2 / React 18 application backed by Supabase.
  Existing nutrition, water, weight, supplement, workout, account, progress,
  and coaching flows were preserved.
- [BottomNav](../src/components/BottomNav.tsx) now provides Home, Nutrition,
  Quick Log, Workout, and Plans. Quick Log exposes six actions, including
  sleep. Logging handlers check Supabase write errors before reporting success.
- Plans, prices, active flags, entitlements, and AI request limits are
  centralized in [plans.ts](../src/lib/billing/plans.ts). Existing prices and
  availability were preserved. Free/Basic/Standard remain active; Premium/Pro
  remain inactive; trial eligibility remains disabled.
- Paid checkout is unavailable. Razorpay order, verification, and webhook
  endpoints return `410 Gone`; no hosted payment URLs remain in the plan UI.
  RevenueCat lookup errors fail closed. No verified mapping for new Basic or
  Standard purchases, refund lifecycle contract, or trial terms is available.
- AI usage is reserved before external generation through a service-role RPC.
  The new additive reservation migration assigns reservation IDs and makes
  commit/release operations idempotent. Unrelated entitlement checks no longer
  query AI usage. Per the approved strict-expiry policy, active subscriptions
  with invalid or elapsed period ends resolve to Free. The AI quota migrations
  are **not applied**; deployment requires them and a server-only
  `SUPABASE_SERVICE_ROLE_KEY`.
- The required read-only security review reported no high-confidence
  vulnerabilities in the reviewed changes. This is not a deployment-config,
  production database, provider, or full-product security certification.
- `npm test`, typecheck, lint, build, and diff checks are the repeatable local
  validation targets. Browser testing was limited to unsigned local UI smoke
  checks; live persistence, subscription refresh, and concurrent database
  quota behavior remain unverified.

## Historical pre-change baseline

The following sections preserve the audit captured before implementation. They
are historical context, not a description of the current worktree.

### 1. What already worked

- The project uses Next.js 14.2 App Router, React 18, and TypeScript. Client
  screens live under `src/app`; shared UI and business logic live under
  `src/components` and `src/lib`.
- Supabase authentication is used throughout the application. The dashboard,
  account, nutrition, water, weight, supplements, workouts, coaching, and
  progress screens query user-scoped records.
- Nutrition includes food search, a bundled food database, meal logging,
  history/favourites, barcode scanning, and scan/search API routes.
- Workout includes an exercise library, templates, active sessions, logging,
  history, and progress summaries.
- Hydration, weight, supplements, measurements, meal planning, coaching, and
  progress pages already exist. The dashboard reads actual profile, food, and
  water data and exposes progress-related screens.
- Account is implemented at `/profile`; it includes profile/goals, theme and
  reminder settings, subscription entry, privacy/data controls, support, and
  inline Terms and Privacy content. The dashboard avatar already links to it.
- A provider-independent subscription mirror, plan/entitlement helpers, a
  RevenueCat Web SDK adapter, authenticated subscription APIs, RevenueCat
  refresh, and a RevenueCat webhook exist. The RevenueCat webhook checks its
  authorization header and records event IDs for idempotency.
- The schema source defines profiles, food/weight logs, subscriptions, AI
  usage, webhook events, RLS policies, and an atomic `record_ai_usage` RPC.
  A dashboard-index migration is also present in the worktree.
- Existing validation baseline: `npm run lint` exits successfully with 17
  existing React-hook/ref warnings; `npx tsc --noEmit` passes; `npm run build`
  passes (Next.js reports that build skips type validation and linting).
  `package.json` has no test script or configured test runner.

## 2. What partially works

- The current bottom navigation is Home, Nutrition, Workout, Weight, Account.
  It is fixed and safe-area aware, but does not match the required five
  destinations and has no Quick Log action.
- The dashboard already shows daily nutrition/hydration summaries and links to
  progress details, but does not yet provide a complete Home summary of all
  supported health data.
- Account has useful sections and inline Terms/Privacy pages, but subscription
  status and management are split across routes. There are no dedicated
  payment-history, refund/cancellation-terms, or full legal-document routes.
- `/subscription` displays plan names, monthly/yearly Razorpay pricing, and
  Razorpay hosted links. `PLANS` and `razorpay-config` are separate sources,
  and plan features are manually listed in the page. The CTA opens an external
  payment URL; it is not linked to authenticated account ownership or verified
  subscription activation.
- The RevenueCat server mirror is the stronger existing recurring-subscription
  path, but its configured products cover Premium/Pro only. The plans UI shows
  Basic/Standard/Pro and routes to Razorpay instead, so the two provider
  configurations do not describe one coherent checkout experience.
- Subscription management reads normalized server state and only opens a real
  RevenueCat management URL when available. It does not provide in-app plan
  changes, cancellation, or payment-history retrieval.
- Entitlements are centralized for several features and the insights endpoint
  checks an entitlement. AI quota tracking is incomplete: the coach checks
  against a limit without loading actual usage, usage persistence is not
  concurrency-safe in application code, and the existing SQL RPC is not used
  by that flow.
- RevenueCat trial status can be normalized, but no configured seven-day trial
  terms, eligibility policy, or trial checkout has been established in the
  application. The current Razorpay checkout helper is a one-time-order flow,
  not verified evidence of an appropriate subscription/trial flow.

## 3. What is broken or unsafe to rely on

- The primary navigation does not meet the requested information architecture.
- The Razorpay order API accepts an amount from the request body. The generic
  payment verification route verifies a signature but does not by itself prove
  that an order represents an approved subscription or activate the user's
  entitlements. The Razorpay webhook is separate and cannot make the current
  external-link Plans CTA an authenticated end-to-end subscription flow.
- AI usage lookup bounds currently use the first day of the current month as
  both the lower bound and the exclusive upper bound. `canUseAI` also returns
  usage as zero instead of reading persisted usage; usage writes use a
  read/modify/write path instead of the existing atomic RPC.
- `supabase-schema.sql` does not define every table used by the app, including
  water, workout, and supplement tables. A manually provisioned Supabase
  project may have them, but this repository alone does not establish their
  schema or RLS.
- The schema defines `phone_number`, while the Account UI reads/writes
  `phone`; this needs reconciliation before claiming profile phone edits
  persist.
- The Account's legal copy includes policy and contact claims that have not
  been verified against company/legal source material. No legal entity,
  registered office, or verified billing/refund terms are documented here.
- There is no sleep logging screen or sleep-log table in the audited route and
  schema inventory.

## 4. What is missing

- A five-item Home | Nutrition | + | Workout | Plans navigation and accessible
  Quick Log sheet connected to the existing feature routes.
- A consistent, approved canonical source for plans, prices, intervals,
  entitlements, and feature limits across the UI and server.
- A single, tested subscription checkout ownership decision/configuration.
  Provider-backed subscription changes, cancellation, receipts/payment
  history, and supported trial enrollment are not complete.
- Full server-side, atomic enforcement of any configured AI usage limit.
- Dedicated sleep logging, should the Quick Log requirement be retained.
- Verified legal/billing disclosures, consent capture where required, and
  company details supplied by the business owner.
- A test runner and repeatable integration/browser QA against configured
  Supabase and provider test credentials.

## 5. Existing integrations to preserve

- Supabase Auth, RLS-backed user data, the current profile/logging model, and
  the existing nutrition/workout/hydration/supplement flows.
- RevenueCat's authenticated browser identity, server-side subscription
  refresh, server-authoritative entitlement mirror, and webhook path where
  configured.
- Razorpay's configured pricing and webhook integration until the business
  explicitly chooses a different provider for the applicable product. Do not
  silently change its prices or recurring terms.
- Existing account, dashboard, logging, exercise, meal-planning, theme, and
  progress behavior.

## 6. Files that should be modified

- `src/components/BottomNav.tsx` for the required primary destinations and
  Quick Log entry point.
- `src/app/subscription/page.tsx` and `src/app/subscription/manage/page.tsx`
  only after selecting and wiring the actual supported billing provider.
- `src/lib/billing/plans.ts`, `src/lib/billing/razorpay-config.ts`, and
  `src/lib/billing/server.ts` to consolidate commercial configuration and
  correct/enforce server-side entitlements.
- Relevant billing API/webhook routes and account links when implementing a
  provider-backed management flow.
- `supabase-schema.sql` and explicit migrations only for required schema/RLS
  changes; preserve existing rows and provider identifiers.
- Account legal copy only after verifying the actual company and policy terms.

## 7. Files that genuinely need to be created

- `docs/KAYVEN_CURRENT_STATE_AUDIT.md` (this audit).
- `docs/KAYVEN_IMPLEMENTATION_REPORT.md` after implementation and validation.
- A sleep page and additive migration only if the required Quick Log sleep
  action is implemented.
- Provider-specific billing pages or migrations only where the chosen provider
  actually supports the advertised action and required data.

## 8. Potential migration and security risks

- Do not run the full schema script against production as a substitute for a
  reviewed migration. It contains DDL, policies, triggers, and functions;
  the current manually maintained schema may not represent deployed state.
- The new sleep feature, if implemented, requires an additive table, ownership
  constraints, and RLS; its migration must be applied before the route is
  enabled in a production Supabase project.
- Avoid duplicate current-subscription rows and preserve RevenueCat/Razorpay
  provider IDs. The existing partial unique index on active subscription
  statuses constrains changes.
- Never trust client plan IDs, prices, subscription status, user IDs, or
  frontend entitlement state for protected operations.
- Continue verifying webhook signatures and idempotency. A payment signature
  alone is not equivalent to confirming the correct approved subscription,
  ownership, amount, and lifecycle state.
- Do not collect or store payment card details in Kayven.
- Do not advertise trials, discounts, refunds, cancellation timing, or company
  details without confirmation from the billing provider and business owner.

## 9. Recommended implementation sequence

1. Establish baseline and record current architecture (complete).
2. Implement the required navigation and connect its destinations without
   replacing existing feature routes.
3. Add Quick Log actions backed by existing routes; add sleep persistence only
   with its explicit migration and clear setup requirement.
4. Correct and atomically enforce configured server-side usage limits.
5. Reconcile plans/provider configuration with business approval; only then
   implement supported checkout, trial, management, cancellation, and payment
   history flows.
6. Verify legal copy and add accurate disclosures after founder/legal review.
7. Run typecheck, lint, build, and browser QA; report provider and database
   flows as NOT VERIFIED unless exercised against their configured test
   environments.
