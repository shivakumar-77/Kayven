import { canUseFeature, getAIRequestLimit, getUserEntitlements, planFromSubscription } from './entitlements'
import { getPlanConfig, PAID_PLAN_IDS, PLANS } from './plans'
import {
  commitAIUsage,
  entitlementDeniedPayload,
  isDevelopmentOverrideAllowed,
  releaseAIUsage,
  releaseExpiredAIUsageReservations,
  requiredPlanForFeature,
  requireEntitlement,
  reserveAIUsage,
  runMeteredAI,
  suggestedUpgradePlan,
} from './server'
import { finalizeReservation } from './server'
import { aiAbuseGuard, AIAbuseGuard, FAILURE_WINDOW_MS, MAX_RECENT_FAILURES } from './abuse-guard'
import { createSuggestionsRequester } from '../suggestions/request'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

async function expectRejection(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action()
  } catch {
    return
  }
  throw new Error(message)
}

export async function runBillingTests(): Promise<void> {
  let idempotencySequence = 0
  const testIdempotencyKey = () => `00000000-0000-4000-8000-${String(++idempotencySequence).padStart(12, '0')}`
  const removedPlanId = ['life', 'time'].join('')
  if (removedPlanId in PLANS) throw new Error('removed plan must not exist')
  if (getPlanConfig('invalid-plan').id !== 'free') throw new Error('invalid plan must default to free')

  const free = getUserEntitlements(null)
  const premium = getUserEntitlements({ plan_id: 'premium' })
  const pro = getUserEntitlements({ plan_id: 'pro' })
  const standard = getUserEntitlements({ plan_id: 'standard' })
  const expired = getUserEntitlements({ plan_id: 'pro', status: 'expired' })
  const now = Date.now()
  const activeFutureSubscription = planFromSubscription({
    plan_id: 'standard',
    status: 'active',
    current_period_end: new Date(now + 60_000).toISOString(),
  }, now)
  const scheduledCancellation = planFromSubscription({
    plan_id: 'pro',
    status: 'canceled',
    cancel_at_period_end: true,
    current_period_end: new Date(now + 60_000).toISOString(),
  }, now)
  const immediateCancellation = planFromSubscription({
    plan_id: 'standard',
    status: 'canceled',
    cancel_at_period_end: false,
    current_period_end: new Date(now + 60_000).toISOString(),
  }, now)
  const staleActiveSubscription = planFromSubscription({
    plan_id: 'standard',
    status: 'active',
    current_period_end: new Date(now - 60_000).toISOString(),
  }, now)
  const invalidPeriodSubscription = planFromSubscription({
    plan_id: 'standard',
    status: 'active',
    current_period_end: 'not-a-date',
  }, now)

  if (getAIRequestLimit(free) !== 10) throw new Error('free AI limit is incorrect')
  if (getAIRequestLimit(getUserEntitlements({ plan_id: 'basic' })) !== 100) throw new Error('basic AI limit is incorrect')
  if (getAIRequestLimit(standard) !== 100) throw new Error('standard AI limit is incorrect')
  if (getAIRequestLimit(premium) !== 100) throw new Error('premium AI limit is incorrect')
  if (getAIRequestLimit(pro) !== 300) throw new Error('pro AI limit is incorrect')
  if (canUseFeature(free, 'advanced_ai_coach')) throw new Error('free advanced AI must be disabled')
  if (canUseFeature(premium, 'advanced_ai_coach')) throw new Error('premium advanced AI must remain Pro-only')
  if (canUseFeature(premium, 'advanced_meal_planning')) throw new Error('unimplemented advanced meal planning must remain unavailable')
  if (!canUseFeature(standard, 'advanced_progress')) throw new Error('standard advanced progress must be enabled')
  if (!canUseFeature(pro, 'advanced_progress')) throw new Error('pro advanced progress must be enabled')
  if (canUseFeature(expired, 'advanced_progress')) throw new Error('expired subscription must resolve to Free entitlements')
  if (activeFutureSubscription.id !== 'standard') throw new Error('active subscription should retain paid access before period end')
  if (scheduledCancellation.id !== 'pro') throw new Error('scheduled cancellation should retain paid access until period end')
  if (immediateCancellation.id !== 'free') throw new Error('immediate cancellation should resolve to Free')
  if (staleActiveSubscription.id !== 'free') throw new Error('paid access must end after the verified period end')
  if (invalidPeriodSubscription.id !== 'free') throw new Error('invalid subscription period must fail closed')
  if (requiredPlanForFeature('advanced_progress') !== 'standard') throw new Error('advanced progress should recommend an active plan')
  if (requiredPlanForFeature('advanced_ai_coach') !== null) throw new Error('coming-soon AI should not recommend an inactive plan')
  if (entitlementDeniedPayload({ allowed: false, state: {} as never, requiredPlan: 'pro' }).requiredPlan !== 'pro') throw new Error('structured entitlement denial is incorrect')
  if (suggestedUpgradePlan('free') !== 'basic') throw new Error('free should suggest the lowest active paid plan')
  if (suggestedUpgradePlan('basic') !== 'standard') throw new Error('basic should suggest standard')
  if (suggestedUpgradePlan('premium') !== 'standard') throw new Error('legacy premium should suggest an active plan')
  if (suggestedUpgradePlan('pro') !== null) throw new Error('pro should not suggest a higher plan')
  if (PAID_PLAN_IDS.join(',') !== 'basic,standard,pro') throw new Error('only the three approved paid tier names should be purchasable')
  if (PLANS.basic.active !== true || PLANS.standard.active !== true || PLANS.pro.active !== true || PLANS.premium.active) throw new Error('paid plan catalog availability is incorrect')
  if (Object.values(PLANS).some(plan => 'prices' in plan)) throw new Error('unapproved prices must not be embedded in plan configuration')
  if (Object.values(PLANS).some(plan => plan.trialEligible)) throw new Error('trials must remain disabled pending verification')

  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  let reserveCallCount = 0
  const rpcClient = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      if (name === 'reserve_ai_usage_idempotent') {
        reserveCallCount += 1
        return {
          data: [reserveCallCount === 1
            ? { reservation_id: 'reservation-1', allowed: true, request_count: 1, duplicate: false }
            : { reservation_id: null, allowed: false, request_count: 10, duplicate: false }],
          error: null,
        }
      }
      return { data: true, error: null }
    },
  }
  const reservation = await reserveAIUsage('test-user', 10, testIdempotencyKey(), rpcClient)
  if (!reservation.allowed || reservation.reservationId !== 'reservation-1' || reservation.requestCount !== 1) {
    throw new Error('AI usage reservation response was not parsed correctly')
  }
  if (rpcCalls[0]?.name !== 'reserve_ai_usage_idempotent'
    || rpcCalls[0]?.args.p_user_id !== 'test-user'
    || !rpcCalls[0]?.args.p_idempotency_key) {
    throw new Error('AI usage reservation must call the service-side reserve RPC')
  }
  const deniedReservation = await reserveAIUsage('test-user', 10, testIdempotencyKey(), rpcClient)
  if (deniedReservation.allowed || deniedReservation.requestCount !== 10 || deniedReservation.reservationId !== null) {
    throw new Error('AI usage limit denial must not return a reservation ID')
  }
  if (!await commitAIUsage('reservation-1', rpcClient)) throw new Error('AI usage reservation commit failed')
  if (rpcCalls[2]?.name !== 'commit_ai_usage_reservation' || rpcCalls[2]?.args.p_reservation_id !== 'reservation-1') {
    throw new Error('AI usage commit must be keyed by reservation ID')
  }
  if (!await releaseAIUsage('reservation-1', rpcClient)) throw new Error('AI usage reservation release failed')
  if (rpcCalls[3]?.name !== 'release_ai_usage_reservation' || rpcCalls[3]?.args.p_reservation_id !== 'reservation-1') {
    throw new Error('AI usage release must be keyed by reservation ID')
  }

  const originalConsoleError = console.error
  console.error = () => undefined
  try {
    const failingClient = { rpc: async () => ({ data: null, error: { message: 'database unavailable' } }) }
    const malformedClients = [
      { rpc: async () => ({ data: [{ allowed: true, request_count: 1, duplicate: false }], error: null }) },
      { rpc: async () => ({ data: [{ reservation_id: 'r', allowed: 'yes', request_count: 1, duplicate: false }], error: null }) },
      { rpc: async () => ({ data: [], error: null }) },
    ]
    await expectRejection(() => reserveAIUsage('test-user', 10, testIdempotencyKey(), failingClient), 'reservation RPC errors must fail closed')
    await expectRejection(() => reserveAIUsage('test-user', 10, testIdempotencyKey(), null), 'missing admin client must fail closed')
    for (const client of malformedClients) {
      await expectRejection(() => reserveAIUsage('test-user', 10, testIdempotencyKey(), client), 'malformed reservation results must fail closed')
    }
    await expectRejection(() => commitAIUsage('reservation-1', failingClient), 'commit RPC errors must be surfaced')
    await expectRejection(() => releaseAIUsage('reservation-1', failingClient), 'release RPC errors must be surfaced')
    await expectRejection(() => releaseAIUsage('reservation-1', null), 'cleanup without an admin client must be surfaced')

    const alreadyFinalized = { rpc: async () => ({ data: false, error: null }) }
    if (await commitAIUsage('reservation-1', alreadyFinalized) !== false) throw new Error('a rejected commit must report false')
    if (await releaseAIUsage('reservation-1', alreadyFinalized) !== false) throw new Error('a rejected release must report false')
  } finally {
    console.error = originalConsoleError
  }

  const entitlementCheck = await requireEntitlement({
    from: (table: string) => {
      if (table === 'ai_usage') throw new Error('entitlement checks must not query AI usage')
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          }),
        }),
      }
    },
  }, 'test-user', 'advanced_progress')
  if (entitlementCheck.allowed || entitlementCheck.state.plan.id !== 'free') {
    throw new Error('free entitlement check should not require an AI usage query')
  }


  // Metered AI helper: fake supabase (subscription) and stateful fake admin RPC client.
  const subscriptionClient = {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
  }
  const makeAdmin = (limit: number, opts: { failCleanup?: boolean; failReserve?: boolean } = {}) => {
    aiAbuseGuard.reset()
    const state = {
      used: 0,
      committed: 0,
      released: 0,
      users: [] as string[],
      finalized: new Set<string>(),
      keys: new Map<string, string>(),
    }
    let seq = 0
    return {
      state,
      rpc: async (name: string, args: Record<string, any>) => {
        if (name === 'reserve_ai_usage_idempotent') {
          if (opts.failReserve) return { data: null, error: { message: 'db down' } }
          const key = `${args.p_user_id}:${args.p_idempotency_key}`
          const previousId = state.keys.get(key)
          if (previousId) {
            return { data: [{ reservation_id: previousId, allowed: false, request_count: state.used, duplicate: true }], error: null }
          }
          state.users.push(args.p_user_id)
          if (state.used >= limit) return { data: [{ reservation_id: null, allowed: false, request_count: state.used, duplicate: false }], error: null }
          state.used += 1
          seq += 1
          const reservationId = `r${seq}`
          state.keys.set(key, reservationId)
          return { data: [{ reservation_id: reservationId, allowed: true, request_count: state.used, duplicate: false }], error: null }
        }
        if (opts.failCleanup) return { data: null, error: { message: 'cleanup failed' } }
        if (state.finalized.has(args.p_reservation_id)) return { data: false, error: null }
        state.finalized.add(args.p_reservation_id)
        if (name === 'commit_ai_usage_reservation') state.committed += 1
        else { state.released += 1; state.used -= 1 }
        return { data: true, error: null }
      },
    }
  }
  const meter = (admin: any, execute: () => Promise<any>, feature: any = 'ai_coach', userId = 'user-a') =>
    runMeteredAI({ supabase: subscriptionClient, userId, feature, idempotencyKey: testIdempotencyKey(), execute, adminClient: admin })

  const originalError = console.error
  const originalWarn = console.warn
  console.error = () => undefined
  console.warn = () => undefined
  try {
    // success commits exactly once
    let admin = makeAdmin(10)
    let outcome = await meter(admin, async () => ({ value: 'ok', billable: true }))
    if (outcome.status !== 'ok' || admin.state.committed !== 1 || admin.state.released !== 0 || admin.state.used !== 1) throw new Error('successful AI call must commit exactly once')

    // empty / non-billable result releases
    admin = makeAdmin(10)
    outcome = await meter(admin, async () => ({ value: null, billable: false }))
    if (outcome.status !== 'ok' || admin.state.released !== 1 || admin.state.committed !== 0 || admin.state.used !== 0) throw new Error('non-billable result must release the reservation')

    // thrown provider error releases and propagates
    admin = makeAdmin(10)
    await expectRejection(() => meter(admin, async () => { throw new Error('provider timeout') }), 'provider errors must propagate')
    if (admin.state.released !== 1 || admin.state.used !== 0) throw new Error('provider exception must release the reservation')

    // exhaustion: provider is never called
    admin = makeAdmin(1)
    let calls = 0
    await meter(admin, async () => { calls += 1; return { value: 1, billable: true } })
    outcome = await meter(admin, async () => { calls += 1; return { value: 1, billable: true } })
    if (outcome.status !== 'limit_reached' || calls !== 1 || admin.state.used !== 1) throw new Error('exhausted quota must block the provider call')

    // reservation failure fails closed without calling the provider
    admin = makeAdmin(10, { failReserve: true })
    calls = 0
    outcome = await meter(admin, async () => { calls += 1; return { value: 1, billable: true } })
    if (outcome.status !== 'unavailable' || calls !== 0) throw new Error('reservation failure must fail closed')

    // missing admin client fails closed
    outcome = await meter(null, async () => { calls += 1; return { value: 1, billable: true } })
    if (outcome.status !== 'unavailable' || calls !== 0) throw new Error('missing admin client must fail closed')

    // feature denial never reserves
    admin = makeAdmin(10)
    outcome = await meter(admin, async () => { calls += 1; return { value: 1, billable: true } }, 'advanced_progress')
    if (outcome.status !== 'feature_denied' || admin.state.users.length !== 0 || calls !== 0) throw new Error('feature denial must not reserve or call the provider')

    // Unconfirmed commit must not be reported as a completed metered operation.
    admin = makeAdmin(10, { failCleanup: true })
    outcome = await meter(admin, async () => ({ value: 'ok', billable: true }))
    if (outcome.status !== 'unavailable' || admin.state.used !== 1 || admin.state.released !== 0) {
      throw new Error('unconfirmed commit must fail closed and keep its reservation')
    }


    // Failure-cost guard: in-flight limit, failure cooldown, expiry, isolation, no bypass.
    aiAbuseGuard.reset()
    admin = makeAdmin(10)
    let release1: () => void = () => undefined
    const slow = meter(admin, () => new Promise(resolve => { release1 = () => resolve({ value: 1, billable: true }) }))
    await new Promise(resolve => setTimeout(resolve, 0))
    outcome = await meter(admin, async () => ({ value: 2, billable: true }))
    if (outcome.status !== 'throttled' || (outcome as any).reason !== 'in_progress' || admin.state.users.length !== 1) throw new Error('overlapping requests from one user must be throttled before reserving')
    const otherUser = await meter(admin, async () => ({ value: 3, billable: true }), 'ai_coach', 'user-b')
    if (otherUser.status !== 'ok') throw new Error('one user in flight must not block another user')
    release1(); await slow
    if ((await meter(admin, async () => ({ value: 4, billable: true }))).status !== 'ok') throw new Error('a finished request frees the in-flight slot')

    admin = makeAdmin(100)
    for (let i = 0; i < MAX_RECENT_FAILURES; i++) await meter(admin, async () => ({ value: null, billable: false }))
    calls = 0
    outcome = await meter(admin, async () => { calls += 1; return { value: 1, billable: true } })
    if (outcome.status !== 'throttled' || (outcome as any).reason !== 'cooldown' || calls !== 0 || admin.state.used !== 0) throw new Error('repeated provider failures must trigger a cooldown without reserving')
    if ((await meter(admin, async () => ({ value: 1, billable: true }), 'ai_coach', 'user-c')).status !== 'ok') throw new Error('cooldown must be per user')
    admin = makeAdmin(100)
    for (let i = 0; i < MAX_RECENT_FAILURES; i++) await meter(admin, async () => { throw new Error('boom') }).catch(() => undefined)
    if ((await meter(admin, async () => ({ value: 1, billable: true }))).status !== 'throttled') throw new Error('thrown provider failures must count toward the cooldown')
    admin = makeAdmin(0)
    for (let i = 0; i < MAX_RECENT_FAILURES + 2; i++) await meter(admin, async () => ({ value: 1, billable: true }))
    admin = makeAdmin(10)
    if ((await meter(admin, async () => ({ value: 1, billable: true }))).status !== 'ok') throw new Error('quota exhaustion must not count as provider failure')

    let clock = 1_000_000
    const timed = new AIAbuseGuard(() => clock)
    for (let i = 0; i < MAX_RECENT_FAILURES; i++) { const d = timed.begin('u'); if (!d.allowed) throw new Error('unexpected block'); d.finish(true) }
    const blocked: any = timed.begin('u')
    if (blocked.allowed || blocked.reason !== 'cooldown' || blocked.retryAfterSeconds < 1) throw new Error('guard must block after repeated failures')
    clock += FAILURE_WINDOW_MS + 1
    const reopened = timed.begin('u')
    if (!reopened.allowed) throw new Error('cooldown must expire after the window')
    reopened.finish(false); reopened.finish(true)
    if (!timed.begin('u').allowed) throw new Error('finish must be idempotent')
    aiAbuseGuard.reset()

    // per-user isolation: each reservation is made for the calling user only
    admin = makeAdmin(10)
    await meter(admin, async () => ({ value: 1, billable: true }), 'ai_coach', 'user-a')
    await meter(admin, async () => ({ value: 1, billable: true }), 'ai_coach', 'user-b')
    if (admin.state.users.join(',') !== 'user-a,user-b') throw new Error('reservations must be made for the requesting user')
  } finally {
    console.error = originalError
    console.warn = originalWarn
  }


  // Dashboard suggestions: no automatic fetch, single-flight, quota state.
  const dashboardSource = nodeFs.readFileSync(nodePath.join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8')
  const loadBody = dashboardSource.slice(dashboardSource.indexOf('const load = useCallback'), dashboardSource.indexOf('useEffect(() => { load() }'))
  if (/loadSuggestions|\/api\/suggestions/.test(loadBody)) throw new Error('dashboard load must not fetch AI suggestions')
  if ((dashboardSource.match(/loadSuggestions\(/g) ?? []).length !== 1 || !dashboardSource.includes('onClick={loadSuggestions}')) {
    throw new Error('suggestions must only be requested from the explicit button handler')
  }
  let fetchCount = 0
  let resolveFetch: (v: any) => void = () => undefined
  let signalFirstFetch: () => void = () => undefined
  let signalSecondFetch: () => void = () => undefined
  const firstFetchStarted = new Promise<void>(resolve => { signalFirstFetch = resolve })
  const secondFetchStarted = new Promise<void>(resolve => { signalSecondFetch = resolve })
  const makeRequestStorage = () => {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
  }
  const requester = createSuggestionsRequester(() => {
    fetchCount += 1
    if (fetchCount === 1) signalFirstFetch()
    if (fetchCount === 2) signalSecondFetch()
    return new Promise(r => { resolveFetch = r })
  }, makeRequestStorage())
  const first = requester({}), second = requester({}), third = requester({})
  await firstFetchStarted
  resolveFetch({ ok: true, status: 200, json: async () => ({ result: { tip: 'x' } }) })
  const settled = await Promise.all([first, second, third])
  if (fetchCount !== 1 || settled.some(r => r.status !== 'success')) throw new Error('repeated clicks must share one request')
  const again = await createSuggestionsRequester(async () => ({ ok: true, status: 200, json: async () => ({}) }), makeRequestStorage())({})
  if (again.status !== 'error') throw new Error('empty responses must surface an error state')
  const afterSettle = requester({})
  await secondFetchStarted
  resolveFetch({ ok: true, status: 200, json: async () => ({ result: { tip: 'y' } }) })
  await afterSettle
  if ((fetchCount as number) !== 2) throw new Error('a new request is allowed after the previous one settles')
  const limited = await createSuggestionsRequester(async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: 'AI_USAGE_LIMIT_REACHED', message: 'limit' }),
  }), makeRequestStorage())({})
  if (limited.status !== 'limit' || limited.message !== 'limit') throw new Error('quota exhaustion must be reported as a limit state')
  const thrown = await createSuggestionsRequester(async () => { throw new Error('network') }, makeRequestStorage())({})
  if (thrown.status !== 'error') throw new Error('network failures must surface an error state')

  const retryStorage = makeRequestStorage()
  const retryKeys: string[] = []
  let retryCall = 0
  const retryRequester = createSuggestionsRequester(async (_url, init) => {
    retryKeys.push((init.headers as Record<string, string>)['Idempotency-Key'])
    retryCall += 1
    if (retryCall === 1) throw new Error('ambiguous network outcome')
    return {
      ok: false,
      status: retryCall < 3 ? 503 : 409,
      json: async () => ({ error: 'AI_REQUEST_ALREADY_HANDLED' }),
    }
  }, retryStorage)
  await retryRequester({ same: 'logical-request' })
  await retryRequester({ same: 'logical-request' })
  await retryRequester({ same: 'logical-request' })
  await retryRequester({ same: 'logical-request' })
  if (retryKeys.some(key => key !== retryKeys[0])) {
    throw new Error('ambiguous or duplicate outcomes must keep the same idempotency key')
  }

  const malformedStorage = makeRequestStorage()
  const malformedKeys: string[] = []
  let malformedCall = 0
  const malformedRequester = createSuggestionsRequester(async (_url, init) => {
    malformedKeys.push((init.headers as Record<string, string>)['Idempotency-Key'])
    malformedCall += 1
    return malformedCall === 1
      ? { ok: true, status: 200, json: async () => { throw new Error('response body was truncated') } }
      : { ok: false, status: 409, json: async () => ({ error: 'AI_REQUEST_ALREADY_HANDLED' }) }
  }, malformedStorage)
  await malformedRequester({ same: 'logical-request' })
  await malformedRequester({ same: 'logical-request' })
  if (malformedKeys[0] !== malformedKeys[1]) throw new Error('unreadable success response must retain its retry key')

  // Orphan cleanup: JS simulation of the SQL semantics (not a database test).
  const makeStore = (role = 'service_role') => {
    const now = Date.now()
    const rows: Array<{ id: string; user: string; status: string; ageMin: number }> = [
      { id: 'old-a', user: 'a', status: 'reserved', ageMin: 60 },
      { id: 'old-a2', user: 'a', status: 'reserved', ageMin: 30 },
      { id: 'fresh-a', user: 'a', status: 'reserved', ageMin: 1 },
      { id: 'done-b', user: 'b', status: 'committed', ageMin: 90 },
      { id: 'old-b', user: 'b', status: 'reserved', ageMin: 45 },
    ]
    const usage: Record<string, number> = { a: 3, b: 2 }
    void now
    return {
      rows, usage, failNext: false,
      rpc: async function (this: any, name: string, args: Record<string, any>) {
        if (role !== 'service_role') return { data: null, error: { message: 'Service role required' } }
        if (this.failNext) { this.failNext = false; return { data: null, error: { message: 'db down' } } }
        if (name !== 'release_expired_ai_usage_reservations') return { data: null, error: { message: 'unknown' } }
        const threshold = parseInt(args.p_older_than, 10)
        let released = 0
        for (const row of rows) {
          if (row.status === 'reserved' && row.ageMin > threshold) {
            row.status = 'released'
            usage[row.user] = Math.max(0, usage[row.user] - 1)
            released += 1
          }
        }
        return { data: released, error: null }
      },
    }
  }
  let store = makeStore()
  const call = (client: any, minutes?: number) => releaseExpiredAIUsageReservations({ olderThanMinutes: minutes }, client)
  if (await call(store, 15) !== 3 || store.usage.a !== 1 || store.usage.b !== 1) throw new Error('expired reservations must be released with accurate accounting')
  if (store.rows.find(r => r.id === 'fresh-a')?.status !== 'reserved') throw new Error('active reservations must not be released')
  if (store.rows.find(r => r.id === 'done-b')?.status !== 'committed') throw new Error('committed reservations must be untouched')
  if (await call(store, 15) !== 0 || store.usage.a !== 1 || store.usage.b !== 1) throw new Error('duplicate cleanup must be harmless')
  await expectRejection(() => call(store, 1), 'thresholds below the floor must be rejected')
  await expectRejection(() => call(store, Number.NaN), 'invalid thresholds must be rejected')
  const quietError = console.error
  console.error = () => undefined
  await expectRejection(() => call(null, 15), 'missing admin client must be rejected')
  await expectRejection(() => call(makeStore('authenticated'), 15), 'non-service roles must be rejected')
  store = makeStore()
  store.failNext = true
  const before = JSON.stringify(store.usage)
  await expectRejection(() => call(store, 15), 'failed cleanup must be surfaced')
  if (JSON.stringify(store.usage) !== before) throw new Error('failed cleanup must not change quota accounting')
  if (store.rows.filter(r => r.status === 'released').length !== 0) throw new Error('failed cleanup must not release reservations')
  console.error = quietError

  // Finalization: bounded retries, ambiguous outcomes, no commit->release conversion.
  {
    const quiet = console.error
    const quietWarn = console.warn
    console.error = () => undefined
    console.warn = () => undefined
    const fast = { retryDelayMs: 1, attemptTimeoutMs: 30 }
    const scripted = (script: Array<'error' | 'hang' | boolean>) => {
      const calls: string[] = []
      return {
        calls,
        rpc: (name: string) => {
          calls.push(name)
          const step = script[Math.min(calls.length - 1, script.length - 1)]
          if (step === 'hang') return new Promise(() => undefined)
          if (step === 'error') return Promise.resolve({ data: null, error: { message: 'db down' } })
          return Promise.resolve({ data: step, error: null })
        },
      }
    }
    let c = scripted(['error', 'error', true])
    if (await finalizeReservation('commit', 'r', c, fast) !== 'confirmed' || c.calls.length !== 3) throw new Error('commit must retry transient errors')
    c = scripted(['error'])
    if (await finalizeReservation('commit', 'r', c, fast) !== 'unconfirmed') throw new Error('persistent commit errors must be unconfirmed')
    if (c.calls.length !== 3 || c.calls.some(n => n !== 'commit_ai_usage_reservation')) throw new Error('retries must be bounded and never release after a failed commit')
    c = scripted(['hang', true])
    if (await finalizeReservation('commit', 'r', c, fast) !== 'confirmed' || c.calls.length !== 2) throw new Error('timed-out commit attempt must be retried as commit')
    c = scripted(['hang'])
    if (await finalizeReservation('release', 'r', c, { ...fast, maxAttempts: 2 }) !== 'unconfirmed' || c.calls.length !== 2) throw new Error('hung release must be bounded and unconfirmed')
    c = scripted([false])
    if (await finalizeReservation('commit', 'r', c, fast) !== 'conflict' || c.calls.length !== 1) throw new Error('opposite terminal state must be a conflict without retry')
    c = scripted([true])
    if (await finalizeReservation('release', 'r', c, fast) !== 'confirmed') throw new Error('release must confirm')

    const admin = makeAdmin(10)
    const rpc = admin.rpc
    const seen: string[] = []
    admin.rpc = async (name: string, args: any) => {
      seen.push(name)
      if (name === 'commit_ai_usage_reservation') return { data: null, error: { message: 'db down' } }
      return rpc(name, args)
    }
    const outcome = await runMeteredAI({
      supabase: subscriptionClient, userId: 'user-a', feature: 'ai_coach' as any,
      idempotencyKey: testIdempotencyKey(),
      execute: async () => ({ value: 'x', billable: true }), adminClient: admin, finalization: fast,
    })
    if (outcome.status !== 'unavailable') throw new Error('unconfirmed commit must not be reported as success')
    if (seen.filter(n => n === 'commit_ai_usage_reservation').length !== 3) throw new Error('commit must be attempted a bounded number of times')
    if (seen.includes('release_ai_usage_reservation')) throw new Error('failed commit must not release')
    if (admin.state.used !== 1 || admin.state.released !== 0) throw new Error('unconfirmed commit must keep the unit reserved for cleanup')

    const admin2 = makeAdmin(1)
    const rpc2 = admin2.rpc
    admin2.rpc = async (name: string, args: any) =>
      name === 'release_ai_usage_reservation' ? { data: null, error: { message: 'db down' } } : rpc2(name, args)
    const failedRelease = await runMeteredAI({
      supabase: subscriptionClient, userId: 'user-a', feature: 'ai_coach' as any,
      idempotencyKey: testIdempotencyKey(),
      execute: async () => ({ value: 'x', billable: false }), adminClient: admin2, finalization: fast,
    })
    if (failedRelease.status !== 'unavailable') throw new Error('unconfirmed release must not be reported as a completed operation')
    aiAbuseGuard.reset()
    const blocked = await runMeteredAI({
      supabase: subscriptionClient, userId: 'user-a', feature: 'ai_coach' as any,
      idempotencyKey: testIdempotencyKey(),
      execute: async () => { throw new Error('provider must not run') }, adminClient: admin2, finalization: fast,
    })
    if (blocked.status !== 'limit_reached') throw new Error('failed release must never grant extra quota')
    console.error = quiet
    console.warn = quietWarn
  }

  if (isDevelopmentOverrideAllowed('test-user', 'production', 'pro', 'test-user')) {
    throw new Error('development override must be disabled in production')
  }
  if (!isDevelopmentOverrideAllowed('test-user', 'development', 'pro', 'test-user')) {
    throw new Error('development override should match the configured user')
  }
}