# KAYVEN Billing Architecture

Billing rules and plan prices are centralized in `src/lib/billing/plans.ts`. RevenueCat synchronization is retained for mapped legacy subscriptions. New checkout and trial enrollment remain disabled until a billing provider, account ownership, and customer terms are verified.

## Local development override

To test paid entitlements locally, set these server-only variables in `.env.local`:

```text
KAYVEN_DEV_USER_ID=<authenticated Supabase user UUID>
KAYVEN_DEV_PLAN=pro
```

The override is honored only when `NODE_ENV` is not `production` and only for the exact authenticated user ID. It never accepts a plan from a request body and is disabled in production.

## Database setup

Apply the subscription, usage, and sleep-log additions in `supabase-schema.sql` to a database only after review. The schema creates:

- `subscriptions` for provider-independent subscription state
- `ai_usage` for monthly per-user AI request/token/cost totals
- `reserve_ai_usage(...)` for atomic, service-role-only quota increments and reservation IDs
- `reserve_ai_usage_idempotent(...)` for service-role-only reservation by a stable per-request key
- `commit_ai_usage_reservation(...)` and `release_ai_usage_reservation(...)` for idempotent finalization by reservation ID

Apply the additive migrations in order after reviewing the target database. No migrations have been applied to a live database by this implementation.

## AI usage behavior

- Local and deterministic responses do not consume AI quota.
- An external AI request reserves quota atomically before provider work.
- Failed or empty provider responses release the reservation; successful external AI usage commits it.
- Commit and release calls are idempotent by reservation ID. If cleanup fails, the failure is logged and the reservation remains charged rather than granting unverified quota.
- Metered API requests require a UUID `Idempotency-Key`. First-party clients reuse the key for an ambiguous retry of the same endpoint and payload. A duplicate key returns a safe `409` without repeating provider work; the browser retains that key after a `409` because the original operation may still be active or its result unavailable. Results are not replayed, so a new intentional operation needs a new key.
- After an ambiguous `409`, the browser intentionally keeps the key for that payload. To deliberately run the identical payload as a new operation, the user must start a fresh browser session or clear the session-scoped idempotency entry; different payloads get different keys automatically.
- The request key is stored on the reservation row and unique per user. It prevents duplicate reservation/provider execution when clients reuse the key, but does not make external provider execution exactly-once and does not preserve a response for replay.
- Storage or quota-verification errors fail closed; they do not grant a zero-usage fallback.
- Free, Basic, Standard, and legacy plan limits are configured in `src/lib/billing/plans.ts`.
- A missing subscription row resolves to the Free plan; a database error is surfaced instead of being treated as a missing row.

## Future provider environment variables

These server-side variables are required for RevenueCat synchronization:

```text
REVENUECAT_SECRET_API_KEY=
REVENUECAT_WEBHOOK_SECRET=
REVENUECAT_API_BASE_URL=https://api.revenuecat.com/v1
REVENUECAT_PREMIUM_ENTITLEMENT_ID=premium
REVENUECAT_PRO_ENTITLEMENT_ID=pro
REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID=
REVENUECAT_PREMIUM_YEARLY_PRODUCT_ID=
REVENUECAT_PRO_MONTHLY_PRODUCT_ID=
REVENUECAT_PRO_YEARLY_PRODUCT_ID=
SUPABASE_SERVICE_ROLE_KEY=
```

The browser may receive only these non-secret values:

```text
NEXT_PUBLIC_REVENUECAT_WEB_API_KEY=
NEXT_PUBLIC_REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID=
NEXT_PUBLIC_REVENUECAT_PREMIUM_YEARLY_PRODUCT_ID=
NEXT_PUBLIC_REVENUECAT_PRO_MONTHLY_PRODUCT_ID=
NEXT_PUBLIC_REVENUECAT_PRO_YEARLY_PRODUCT_ID=
```

Never put RevenueCat secrets or `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_*` variable.

## RevenueCat mapping

Product IDs are read from server environment variables and mapped only to `premium` or `pro`. Active entitlement priority is deterministic: `pro` wins over `premium`. Unknown products and entitlements resolve to Free.

## Webhook

Configure RevenueCat to send authorized events to:

```text
POST /api/webhooks/revenuecat
```

The endpoint verifies `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`, records `(provider, event_id)` for idempotency, and updates the Supabase subscription mirror through a service-role client. It does not expose provider payloads to clients.

## Web SDK behavior

The browser adapter uses the authenticated Supabase `user.id` as the RevenueCat App User ID. It initializes only in the browser, only with the public Web API key, and refreshes `/api/subscription` after customer state changes. It never writes to Supabase directly.

## Subscription synchronization

After a RevenueCat purchase or restore, the browser calls the authenticated `POST /api/subscription/refresh` endpoint. The server verifies the customer through the RevenueCat API and updates the Supabase mirror. The client then polls the mirror for a bounded period; it never grants access from RevenueCat customer info alone. If the webhook is delayed, the UI shows a syncing state rather than claiming activation.

Logout and user switching clear both RevenueCat client state and the shared `/api/subscription` cache. Subscription requests are deduplicated in the client cache.

Cancellation keeps access active through the verified current period and sets `cancel_at_period_end`. Expiration or an unverified provider state falls back conservatively to Free. Existing AI usage is never reset when a plan changes.

## Feature enforcement

The existing weekly AI progress analysis endpoint is protected by the server-side `advanced_progress` entitlement. The browser `FeatureGate` and `UpgradePrompt` provide UX only. Future advanced meal planning, workout intelligence, health intelligence, and advanced AI Coach entitlements remain marked Coming soon until those features are implemented.

## Subscription management

Subscription management is available at `/subscription/manage`. The page reads normalized state from `/api/subscription`. No provider management URL is currently exposed, so the page does not offer a cancellation action or construct provider URLs.

If a provider management URL is unavailable, the page explains that management is handled by the billing provider and does not show a fake cancellation action. A confirmation panel appears before opening a verified management URL.

Refresh is authenticated and server-aware. A RevenueCat customer update is followed by `POST /api/subscription/refresh` and a read of the Supabase mirror. Access is not described as active until the server response confirms it.

Canceled subscriptions retain paid access through the verified `current_period_end` when `cancel_at_period_end` is true. Expired or inactive subscription states resolve to Free entitlements while preserving the normalized status for management messaging.

## Sandbox and production

Use separate RevenueCat projects/keys and product IDs for sandbox and production. The web Plans page is informational; new purchases and trials are disabled. The legacy Razorpay order, verification, and webhook endpoints return `410 Gone` and do not process payments.

The baseline still defines the legacy `record_ai_usage` RPC, but application code does not call it and user roles cannot execute it. Do not grant it to application roles; the current AI path uses the reservation RPCs above. Check for external service-role consumers before removing it.
