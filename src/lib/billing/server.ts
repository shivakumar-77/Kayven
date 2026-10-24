import { getAIRequestLimit, getUserEntitlements, planFromSubscription, type Entitlements, type EntitlementId } from './entitlements'
import type { PlanConfig } from './plans'
import { aiAbuseGuard } from './abuse-guard'
import { createSupabaseAdminClient } from '../server/supabase-admin'
import { isValidAIIdempotencyKey } from '../server/ai-idempotency'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'

export interface UserSubscription {
  id?: string
  user_id: string
  provider: string
  provider_customer_id?: string | null
  provider_subscription_id?: string | null
  plan_id: string
  status: SubscriptionStatus
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  created_at?: string
  updated_at?: string
}

export interface AIUsage {
  user_id: string
  period_start: string
  period_end: string
  request_count: number
  input_tokens: number
  output_tokens: number
  estimated_cost: number
}

export interface BillingState {
  subscription: UserSubscription | null
  plan: PlanConfig
  entitlements: Entitlements
  usage: AIUsage
  aiLimit: number | null
}

export interface EntitlementCheck {
  allowed: boolean
  state: Omit<BillingState, 'usage'>
  requiredPlan: 'basic' | 'standard' | 'pro' | 'premium' | null
}

export function entitlementDeniedPayload(check: EntitlementCheck) {
  return {
    error: 'FEATURE_NOT_AVAILABLE' as const,
    message: 'This feature is not included in your current plan.',
    requiredPlan: check.requiredPlan || 'basic',
  }
}

export function requiredPlanForFeature(feature: EntitlementId): 'basic' | 'standard' | 'pro' | 'premium' | null {
  if (feature === 'advanced_progress') return 'standard'
  return null
}

export function suggestedUpgradePlan(planId: string): 'basic' | 'standard' | 'pro' | 'premium' | null {
  if (planId === 'free') return 'basic'
  if (planId === 'basic' || planId === 'premium') return 'standard'
  return null
}

export function shouldPreferAIResponse(message: string, conversation: any[]): boolean {
  // Simple heuristic: prefer AI for longer, more complex messages
  const wordCount = message.trim().split(/\s+/).length
  return wordCount > 10 || conversation.length > 3
}

function periodBounds(now = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

function freeUsage(userId: string): AIUsage {
  const bounds = periodBounds()
  return {
    user_id: userId,
    period_start: bounds.start,
    period_end: bounds.end,
    request_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost: 0,
  }
}

export function isDevelopmentOverrideAllowed(
  userId: string,
  environment = process.env.NODE_ENV,
  configuredPlan = process.env.KAYVEN_DEV_PLAN,
  configuredUserId = process.env.KAYVEN_DEV_USER_ID,
): boolean {
  return environment !== 'production'
    && Boolean(configuredPlan)
    && configuredUserId === userId
}

export async function getUserSubscription(supabase: any, userId: string): Promise<UserSubscription | null> {
  const developmentPlan = process.env.KAYVEN_DEV_PLAN
  if (developmentPlan && isDevelopmentOverrideAllowed(userId)) {
    return {
      user_id: userId,
      provider: 'development',
      plan_id: developmentPlan,
      status: 'active',
    }
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error fetching user subscription')
    throw new Error('Unable to load subscription state')
  }

  return data
}

export interface AIUsageReservation {
  allowed: boolean
  requestCount: number
  reservationId: string | null
  duplicate: boolean
}

export async function reserveAIUsage(
  userId: string,
  limit: number | null,
  idempotencyKey: string,
  adminClient: any = createSupabaseAdminClient(),
): Promise<AIUsageReservation> {
  if (!adminClient) throw new Error('AI usage storage is not configured')

  const { start, end } = periodBounds()
  const { data, error } = await adminClient.rpc('reserve_ai_usage_idempotent', {
    p_user_id: userId,
    p_period_start: start,
    p_period_end: end,
    p_request_limit: limit,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    console.error('Error reserving AI usage')
    throw new Error('Unable to reserve AI usage')
  }

  const result = Array.isArray(data) ? data[0] : data
  if (typeof result?.allowed !== 'boolean'
    || !Number.isInteger(result?.request_count)
    || typeof result?.duplicate !== 'boolean'
    || ((result.allowed || result.duplicate) && typeof result?.reservation_id !== 'string')) {
    throw new Error('AI usage reservation returned an invalid result')
  }

  return {
    allowed: result.allowed,
    requestCount: result.request_count,
    reservationId: result.reservation_id || null,
    duplicate: result.duplicate,
  }
}

export async function commitAIUsage(reservationId: string, adminClient: any = createSupabaseAdminClient()): Promise<boolean> {
  if (!adminClient) throw new Error('AI usage storage is not configured')

  const { data, error } = await adminClient.rpc('commit_ai_usage_reservation', {
    p_reservation_id: reservationId,
  })
  if (error) {
    console.error('Error committing AI usage reservation')
    throw new Error('Unable to commit AI usage reservation')
  }
  return data === true
}

export async function releaseAIUsage(reservationId: string, adminClient: any = createSupabaseAdminClient()): Promise<boolean> {
  if (!adminClient) throw new Error('AI usage storage is not configured')

  const { data, error } = await adminClient.rpc('release_ai_usage_reservation', {
    p_reservation_id: reservationId,
  })
  if (error) {
    console.error('Error releasing AI usage reservation')
    throw new Error('Unable to release AI usage reservation')
  }
  return data === true
}

export const MIN_RESERVATION_EXPIRY_MINUTES = 5
export const DEFAULT_RESERVATION_EXPIRY_MINUTES = 15

/** Releases reservations still pending after the threshold. Idempotent; returns the number released. */
export async function releaseExpiredAIUsageReservations(
  options: { olderThanMinutes?: number; batchSize?: number } = {},
  adminClient: any = createSupabaseAdminClient(),
): Promise<number> {
  if (!adminClient) throw new Error('AI usage storage is not configured')
  const minutes = options.olderThanMinutes ?? DEFAULT_RESERVATION_EXPIRY_MINUTES
  if (!Number.isFinite(minutes) || minutes < MIN_RESERVATION_EXPIRY_MINUTES) {
    throw new Error(`Expiry threshold must be at least ${MIN_RESERVATION_EXPIRY_MINUTES} minutes`)
  }

  const { data, error } = await adminClient.rpc('release_expired_ai_usage_reservations', {
    p_older_than: `${Math.floor(minutes)} minutes`,
    p_limit: options.batchSize ?? 500,
  })
  if (error) {
    console.error('Error releasing expired AI usage reservations')
    throw new Error('Unable to release expired AI usage reservations')
  }
  return typeof data === 'number' ? data : 0
}

async function getCurrentAIUsage(supabase: any, userId: string): Promise<AIUsage> {
  const { start, end } = periodBounds()
  const { data, error } = await supabase
    .from('ai_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', start)
    .maybeSingle()

  if (error) {
    console.error('Error fetching AI usage')
    throw new Error('Unable to load AI usage')
  }

  return data || {
    ...freeUsage(userId),
    period_start: start,
    period_end: end,
  }
}

export async function getBillingState(supabase: any, userId: string): Promise<BillingState> {
  const subscription = await getUserSubscription(supabase, userId)
  const plan = planFromSubscription(subscription)
  const entitlements = getUserEntitlements(subscription)
  const usage = await getCurrentAIUsage(supabase, userId)

  return {
    subscription,
    plan,
    entitlements,
    usage,
    aiLimit: getAIRequestLimit(entitlements),
  }
}

function evaluateEntitlement(subscription: UserSubscription | null, feature: EntitlementId): EntitlementCheck {
  const entitlements = getUserEntitlements(subscription)
  const state = {
    subscription,
    plan: planFromSubscription(subscription),
    entitlements,
    aiLimit: getAIRequestLimit(entitlements),
  }
  const value = state.entitlements[feature]
  const allowed = typeof value === 'boolean' ? value : value.enabled

  return {
    allowed,
    state,
    requiredPlan: requiredPlanForFeature(feature),
  }
}

export async function requireEntitlement(supabase: any, userId: string, feature: EntitlementId): Promise<EntitlementCheck> {
  return evaluateEntitlement(await getUserSubscription(supabase, userId), feature)
}

export type MeteredAIOutcome<T> =
  | { status: 'ok'; value: T }
  | { status: 'feature_denied'; check: EntitlementCheck }
  | { status: 'limit_reached'; planId: string; usage: number; limit: number | null; suggestedPlan: ReturnType<typeof suggestedUpgradePlan> }
  | { status: 'duplicate' }
  | { status: 'unavailable' }
  | { status: 'throttled'; reason: 'in_progress' | 'cooldown'; retryAfterSeconds: number }

export interface MeteredAIOptions<T> {
  supabase: any
  userId: string
  feature: EntitlementId
  idempotencyKey: string
  // `billable` must be true only when the provider produced a usable result.
  execute: () => Promise<{ value: T; billable: boolean }>
  adminClient?: any
  finalization?: FinalizationOptions
}

/**
 * Checks the entitlement, reserves one unit of the shared monthly AI allowance,
 * runs the external AI operation, then finalizes its reservation. A billable result
 * is returned only after its commit is confirmed; unconfirmed finalization fails
 * closed. Execution errors are rethrown after a bounded release attempt.
 */
export async function runMeteredAI<T>(options: MeteredAIOptions<T>): Promise<MeteredAIOutcome<T>> {
  if (!isValidAIIdempotencyKey(options.idempotencyKey)) {
    return { status: 'unavailable' }
  }
  let check: EntitlementCheck
  try {
    check = evaluateEntitlement(await getUserSubscription(options.supabase, options.userId), options.feature)
  } catch (error) {
    console.error('[AI quota] Entitlement lookup failed')
    return { status: 'unavailable' }
  }
  if (!check.allowed) return { status: 'feature_denied', check }

  const guard = aiAbuseGuard.begin(options.userId)
  if ('reason' in guard) return { status: 'throttled', reason: guard.reason, retryAfterSeconds: guard.retryAfterSeconds }

  try {
    return await reserveAndRun(options, check, guard.finish)
  } finally {
    guard.finish(false)
  }
}

async function reserveAndRun<T>(
  options: MeteredAIOptions<T>,
  check: EntitlementCheck,
  finishGuard: (countAsFailure: boolean) => void,
): Promise<MeteredAIOutcome<T>> {
  const aiLimit = check.state.aiLimit
  let reservation: AIUsageReservation
  try {
    reservation = await reserveAIUsage(options.userId, aiLimit, options.idempotencyKey, options.adminClient)
  } catch (error) {
    console.error('[AI quota] Reservation failed')
    return { status: 'unavailable' }
  }

  if (reservation.duplicate) return { status: 'duplicate' }
  if (!reservation.allowed) {
    return {
      status: 'limit_reached',
      planId: check.state.plan.id,
      usage: reservation.requestCount,
      limit: aiLimit,
      suggestedPlan: suggestedUpgradePlan(check.state.plan.id),
    }
  }
  if (!reservation.reservationId) return { status: 'unavailable' }

  const reservationId = reservation.reservationId
  let billable = false
  let value: T
  try {
    const result = await options.execute()
    billable = result.billable === true
    value = result.value
  } catch (error) {
    finishGuard(true)
    await finalizeReservation('release', reservationId, options.adminClient, options.finalization)
    throw error
  }

  const finalized = await finalizeReservation(
    billable ? 'commit' : 'release',
    reservationId,
    options.adminClient,
    options.finalization,
  )
  finishGuard(!billable || finalized !== 'confirmed')
  if (finalized !== 'confirmed') return { status: 'unavailable' }
  return { status: 'ok', value }
}

export type FinalizationOutcome = 'confirmed' | 'conflict' | 'unconfirmed'

export interface FinalizationOptions {
  maxAttempts?: number
  attemptTimeoutMs?: number
  retryDelayMs?: number
}

const FINALIZE_DEFAULTS = { maxAttempts: 3, attemptTimeoutMs: 5000, retryDelayMs: 150 }

/**
 * Reservation state machine: reserved -> committed | released (both terminal, both
 * idempotent in SQL). Finalization makes a bounded number of attempts. Only the
 * requested transition is ever retried; a commit is never converted into a release.
 * - confirmed: the database reports the requested terminal state.
 * - conflict: the database reports the reservation is in the opposite terminal state
 *   (e.g. already reaped by cleanup) or does not exist. Retrying cannot help.
 * - unconfirmed: every attempt errored or timed out; the row may be reserved or may
 *   already have reached the requested terminal state. A timed-out RPC may still
 *   finish in the background, so only the same idempotent transition is retried.
 */
export async function finalizeReservation(
  kind: 'commit' | 'release',
  reservationId: string,
  adminClient?: any,
  options: FinalizationOptions = {},
): Promise<FinalizationOutcome> {
  const maxAttempts = Number.isInteger(options.maxAttempts)
    ? Math.max(1, Math.min(options.maxAttempts!, FINALIZE_DEFAULTS.maxAttempts))
    : FINALIZE_DEFAULTS.maxAttempts
  const attemptTimeoutMs = Number.isFinite(options.attemptTimeoutMs)
    ? Math.max(1, Math.min(options.attemptTimeoutMs!, FINALIZE_DEFAULTS.attemptTimeoutMs))
    : FINALIZE_DEFAULTS.attemptTimeoutMs
  const retryDelayMs = Number.isFinite(options.retryDelayMs)
    ? Math.max(0, Math.min(options.retryDelayMs!, 1000))
    : FINALIZE_DEFAULTS.retryDelayMs
  const operation = kind === 'commit' ? commitAIUsage : releaseAIUsage

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const updated = await Promise.race([
        operation(reservationId, adminClient),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Finalization attempt timed out')), attemptTimeoutMs)
        }),
      ])
      if (updated) return 'confirmed'
      console.warn(`[AI quota] Reservation ${kind} conflict: reservation is in a different final state`)
      return 'conflict'
    } catch {
      console.error(`[AI quota] Reservation ${kind} attempt ${attempt}/${maxAttempts} failed`)
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  console.error(`[AI quota] Reservation ${kind} unconfirmed; left for expiry cleanup`)
  return 'unconfirmed'
}
