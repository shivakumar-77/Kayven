import type { PlanId } from './plans'
import type { ProviderSubscriptionState } from './provider'
import type { SubscriptionStatus } from './server'
import type { RevenueCatConfig } from './revenuecat-config'

export interface RevenueCatEntitlementPayload {
  identifier?: string
  product_identifier?: string | null
  expires_date?: string | null
  purchase_date?: string | null
}

export interface RevenueCatSubscriberPayload {
  entitlements?: Record<string, RevenueCatEntitlementPayload>
  subscriptions?: Record<string, {
    expires_date?: string | null
    unsubscribe_detected_at?: string | null
    billing_issues_detected_at?: string | null
  }>
}

export interface RevenueCatEventPayload {
  id?: string
  type?: string
  app_user_id?: string
  aliases?: string[]
  product_id?: string | null
  original_transaction_id?: string | null
  transaction_id?: string | null
  entitlement_ids?: string[]
  expiration_at_ms?: number | null
  purchased_at_ms?: number | null
  cancel_reason?: string | null
  environment?: string | null
}

const PLAN_PRIORITY: PlanId[] = ['pro', 'premium']

function activeEntitlement(entry: RevenueCatEntitlementPayload, now = Date.now()): boolean {
  return !entry.expires_date || new Date(entry.expires_date).getTime() > now
}

export function mapRevenueCatEntitlementsToPlan(
  entitlements: Record<string, RevenueCatEntitlementPayload> | undefined,
  config: RevenueCatConfig,
): PlanId {
  const active = Object.entries(entitlements || {})
    .filter(([, value]) => activeEntitlement(value))
    .map(([identifier]) => identifier)

  if (active.includes(config.entitlementIds.pro)) return 'pro'
  if (active.includes(config.entitlementIds.premium)) return 'premium'
  return 'free'
}

export function mapRevenueCatProductToPlan(productId: string | null | undefined, config: RevenueCatConfig): PlanId {
  if (!productId) return 'free'
  return config.productIds[productId] || 'free'
}

export function normalizeRevenueCatStatus(event: RevenueCatEventPayload): SubscriptionStatus {
  const type = String(event.type || '').toUpperCase()
  if (type === 'UNCANCELLATION') return 'active'
  if (type.includes('BILLING_ISSUE')) return 'past_due'
  if (type.includes('EXPIRE')) return 'expired'
  if (type.includes('CANCEL')) return 'canceled'
  if (type.includes('INITIAL_PURCHASE') || type.includes('RENEWAL') || type.includes('UNCANCELLATION') || type.includes('PRODUCT_CHANGE') || type.includes('TRANSFER')) return 'active'
  return 'expired'
}

export function normalizeRevenueCatSubscriber(
  customerId: string,
  subscriber: RevenueCatSubscriberPayload,
  config: RevenueCatConfig,
): { planId: PlanId; state: ProviderSubscriptionState | null } {
  const planId = mapRevenueCatEntitlementsToPlan(subscriber.entitlements, config)
  if (planId === 'free') return { planId, state: null }

  const activeEntitlement = Object.entries(subscriber.entitlements || {})
    .filter(([, value]) => activeEntitlementValue(value))
    .sort(([left], [right]) => {
      const leftRank = PLAN_PRIORITY.indexOf(left === config.entitlementIds.pro ? 'pro' : 'premium')
      const rightRank = PLAN_PRIORITY.indexOf(right === config.entitlementIds.pro ? 'pro' : 'premium')
      return leftRank - rightRank
    })[0]?.[1]

  const productId = activeEntitlement?.product_identifier || null
  const subscription = productId ? subscriber.subscriptions?.[productId] : undefined
  const currentPeriodEnd = activeEntitlement?.expires_date || subscription?.expires_date || null

  return {
    planId,
    state: {
      provider: 'revenuecat',
      providerCustomerId: customerId,
      productId,
      status: 'active',
      currentPeriodEnd,
      currentPeriodStart: activeEntitlement?.purchase_date || null,
      cancelAtPeriodEnd: Boolean(subscription?.unsubscribe_detected_at),
    },
  }
}

function activeEntitlementValue(value: RevenueCatEntitlementPayload): boolean {
  return activeEntitlement(value)
}
