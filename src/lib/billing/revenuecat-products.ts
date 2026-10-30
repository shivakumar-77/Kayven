import type { BillingPeriod, PaidPlanId } from './plans'

export interface RevenueCatWebProductMapping {
  planId: PaidPlanId
  billingPeriod: BillingPeriod
}

export interface CheckoutSubscriptionState {
  currentPlan?: string
  billingPurchasesEnabled?: boolean
  statusUnavailable?: boolean
}

export function isRevenueCatCheckoutAllowed(
  state: CheckoutSubscriptionState,
): boolean {
  return state.billingPurchasesEnabled === true
    && state.currentPlan === 'free'
    && state.statusUnavailable !== true
}

export function getPublicRevenueCatWebProductMapping(productId: string): RevenueCatWebProductMapping | null {
  const configuredMappings: Array<[string | undefined, PaidPlanId, BillingPeriod]> = [
    [process.env.NEXT_PUBLIC_REVENUECAT_BASIC_MONTHLY_PRODUCT_ID?.trim(), 'basic', 'monthly'],
    [process.env.NEXT_PUBLIC_REVENUECAT_BASIC_YEARLY_PRODUCT_ID?.trim(), 'basic', 'yearly'],
    [process.env.NEXT_PUBLIC_REVENUECAT_STANDARD_MONTHLY_PRODUCT_ID?.trim(), 'standard', 'monthly'],
    [process.env.NEXT_PUBLIC_REVENUECAT_STANDARD_YEARLY_PRODUCT_ID?.trim(), 'standard', 'yearly'],
    [process.env.NEXT_PUBLIC_REVENUECAT_PRO_AI_MONTHLY_PRODUCT_ID?.trim(), 'pro', 'monthly'],
    [process.env.NEXT_PUBLIC_REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID?.trim(), 'pro', 'yearly'],
  ]
  const mappings = configuredMappings.filter(([configuredProductId]) => Boolean(configuredProductId))

  const configuredIds = mappings.map(([configuredProductId]) => configuredProductId)
  if (new Set(configuredIds).size !== configuredIds.length) return null

  const match = mappings.find(([configuredProductId]) => configuredProductId === productId)
  return match ? { planId: match[1], billingPeriod: match[2] } : null
}
