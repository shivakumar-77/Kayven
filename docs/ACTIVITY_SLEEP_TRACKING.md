# Activity and sleep tracking

## Web behavior

- Step totals are manually entered. The browser does not measure steps and no device integration is represented as connected.
- Walking/running uses foreground `navigator.geolocation` only after the user starts a session. Sessions continue as time-only records if location permission is denied or GPS is unavailable. Browser suspension, loss of connectivity, and closing the tab can interrupt an active session; the page warns before navigation, but does not claim reliable background tracking.
- GPS points are filtered for invalid coordinates, accuracy over 50 m, repeated/near-identical points, and implausible speed over 12 m/s. Accepted points are retained only when the user saves a session. The route display is a private schematic trace, not a street map or turn-by-turn map; it uses no map provider or API key.
- Activity calories are labeled estimates, calculated from an activity MET value and the user's recorded weight. They are unavailable when weight is missing. GPS activity is stored separately from strength workouts and is not added to workout totals.
- Sleep is manually entered. The selected wake-up date determines the sleep record date, while start and end timestamps are converted using the saved IANA time zone. Overlapping intervals are checked in the UI and transactionally rejected by a database trigger, including concurrent submissions. Imported records are deduplicated by source record ID. Sleep stages, efficiency, and automatic sleep measurements are not inferred.
- HealthKit and Health Connect are not available to an ordinary browser. `src/lib/health-data-source.ts` defines the adapter and record contract for a future native implementation; no native authorization is requested by the web app.

## Database

Apply `supabase/migrations/20261025000000_health_activity_sleep_tracking.sql` through the normal Supabase migration workflow before using the new features. It is additive and does not drop or rewrite existing records.

The migration is additive. It does not delete/deduplicate existing sleep rows; the sleep interval index is non-unique so legacy duplicates do not block deployment. New overlapping intervals are rejected transactionally.

It creates:

- `health_tracking_preferences`: per-user step goal, sleep goal, and IANA time zone.
- `activity_daily_summaries`: one per-user/per-local-date step total, with an explicit source.
- `activity_sessions`: saved walk/run sessions, idempotency key, metrics, and a bounded set of route points.

It extends `sleep_logs` with time-in-bed, source, external source-record ID, and notes; adds an imported-record uniqueness index and a non-unique interval lookup index; and adds a `NOT VALID` time-in-bed constraint that enforces the rule on new/updated rows without scanning or rejecting legacy rows. The new tables and sleep records use owner-only RLS; anonymous access is revoked and authenticated access is scoped by `auth.uid()`.

Route coordinates are sensitive location data. They are collected only for an explicitly started session and are not written until the user saves. The current web release has no automated route-retention job or route redaction; users should delete activity records they no longer want retained. A future mobile sync should retain source record IDs for deduplication and request only the permissions needed for the requested data.

## Validation

Run `npm test` for unit and app-route checks, `npm run test:sql` for PGlite migration/RLS/constraint checks, `npx tsc --noEmit` for type checking, `npm run lint` for linting, and `npm run build` for the production build.
