import type { PlanId } from './plans'

export type RevenueCatEntitlementId = 'premium' | 'pro'

export interface RevenueCatConfig {
  secretApiKey: string
  webhookSecret?: string
  apiBaseUrl: string
  entitlementIds: Record<RevenueCatEntitlementId, string>
  productIds: Partial<Record<string, PlanId>>
}

export function getRevenueCatConfig(): RevenueCatConfig | null {
  const secretApiKey = process.env.REVENUECAT_SECRET_API_KEY
  if (!secretApiKey) return null
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET

  const productIds: Partial<Record<string, PlanId>> = {}
  const mappings: Array<[string | undefined, PlanId]> = [
    [process.env.REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID, 'premium'],
    [process.env.REVENUECAT_PREMIUM_YEARLY_PRODUCT_ID, 'premium'],
    [process.env.REVENUECAT_PRO_MONTHLY_PRODUCT_ID, 'pro'],
    [process.env.REVENUECAT_PRO_YEARLY_PRODUCT_ID, 'pro'],
  ]
  for (const [productId, planId] of mappings) {
    if (productId) productIds[productId] = planId
  }
  if (Object.keys(productIds).length === 0) return null

  return {
    secretApiKey,
    webhookSecret,
    apiBaseUrl: process.env.REVENUECAT_API_BASE_URL || 'https://api.revenuecat.com/v1',
    entitlementIds: {
      premium: process.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID || 'premium',
      pro: process.env.REVENUECAT_PRO_ENTITLEMENT_ID || 'pro',
    },
    productIds,
  }
}

export function isRevenueCatConfigured(): boolean {
  return getRevenueCatConfig() !== null
}
