import { getPlanConfig, type Entitlements, type EntitlementId, type PlanId } from './plans'

export type { EntitlementId, EntitlementValue, Entitlements } from './plans'
export { ENTITLEMENT_DEFINITIONS } from './plans'

export function getPlanEntitlements(planId: PlanId): Entitlements {
  return { ...getPlanConfig(planId).entitlements }
}

export function planFromSubscription(subscription?: {
  plan_id?: string | null
  status?: string | null
  cancel_at_period_end?: boolean | null
  current_period_end?: string | null
} | null, now = Date.now()) {
  const periodEndValue = subscription?.current_period_end
  const hasPeriodEnd = Boolean(periodEndValue)
  const periodEnd = periodEndValue ? Date.parse(periodEndValue) : Number.NaN
  const periodHasEnded = hasPeriodEnd && (!Number.isFinite(periodEnd) || periodEnd <= now)
  const scheduledCancellationIsActive = subscription?.status === 'canceled'
    && subscription.cancel_at_period_end === true
    && Number.isFinite(periodEnd)
    && periodEnd > now
  const isInactive = subscription?.status === 'expired'
    || periodHasEnded
    || (subscription?.status === 'canceled' && !scheduledCancellationIsActive)

  return getPlanConfig(isInactive ? 'free' : subscription?.plan_id)
}

export function getUserEntitlements(
  subscription?: {
    plan_id?: string | null
    status?: string | null
    cancel_at_period_end?: boolean | null
    current_period_end?: string | null
  } | null,
  now = Date.now(),
): Entitlements {
  return getPlanEntitlements(planFromSubscription(subscription, now).id)
}

export function canUseFeature(entitlements: Entitlements, feature: EntitlementId): boolean {
  const value = entitlements[feature]
  return typeof value === 'boolean' ? value : value.enabled
}

export function getAIRequestLimit(entitlements: Entitlements): number | null {
  const value = entitlements.ai_coach
  return typeof value === 'boolean' ? (value ? null : 0) : value.limit ?? null
}
