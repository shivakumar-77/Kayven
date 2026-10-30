import type { PlanId } from './plans'
import type { BillingPeriod } from './plans'

export type RevenueCatEntitlementId = 'basic' | 'standard' | 'pro' | 'premium'

export interface RevenueCatProductMapping {
  planId: PlanId
  billingPeriod: BillingPeriod
  purchasable: boolean
}

export interface RevenueCatConfig {
  secretApiKey: string
  webhookSecret?: string
  apiBaseUrl: string
  entitlementIds: Record<RevenueCatEntitlementId, string>
  productIds: Partial<Record<string, RevenueCatProductMapping>>
}

const PAID_PRODUCT_ENVIRONMENTS = [
  ['REVENUECAT_BASIC_MONTHLY_PRODUCT_ID', 'basic', 'monthly'],
  ['REVENUECAT_BASIC_YEARLY_PRODUCT_ID', 'basic', 'yearly'],
  ['REVENUECAT_STANDARD_MONTHLY_PRODUCT_ID', 'standard', 'monthly'],
  ['REVENUECAT_STANDARD_YEARLY_PRODUCT_ID', 'standard', 'yearly'],
  ['REVENUECAT_PRO_AI_MONTHLY_PRODUCT_ID', 'pro', 'monthly'],
  ['REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID', 'pro', 'yearly'],
] as const

export function getRevenueCatWebProductIdentifiers(): Partial<Record<string, {
  planId: Exclude<PlanId, 'free' | 'premium'>
  billingPeriod: BillingPeriod
}>> {
  const result: Record<string, { planId: 'basic' | 'standard' | 'pro'; billingPeriod: BillingPeriod }> = {}
  for (const [environmentName, planId, billingPeriod] of PAID_PRODUCT_ENVIRONMENTS) {
    const productId = process.env[environmentName]?.trim()
    if (productId) result[productId] = { planId, billingPeriod }
  }
  return result
}

export function getRevenueCatConfig(): RevenueCatConfig | null {
  const secretApiKey = process.env.REVENUECAT_SECRET_API_KEY
  if (!secretApiKey) return null
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET

  const productIds: Partial<Record<string, RevenueCatProductMapping>> = {}
  const paidProducts = getRevenueCatWebProductIdentifiers()
  for (const [productId, mapping] of Object.entries(paidProducts)) {
    productIds[productId] = { ...mapping, purchasable: true }
  }

  const legacyMappings: Array<[string | undefined, PlanId, BillingPeriod]> = [
    [process.env.REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID, 'premium', 'monthly'],
    [process.env.REVENUECAT_PREMIUM_YEARLY_PRODUCT_ID, 'premium', 'yearly'],
    [process.env.REVENUECAT_PRO_MONTHLY_PRODUCT_ID, 'pro', 'monthly'],
    [process.env.REVENUECAT_PRO_YEARLY_PRODUCT_ID, 'pro', 'yearly'],
  ]
  for (const [productId, planId, billingPeriod] of legacyMappings) {
    if (productId?.trim() && !productIds[productId.trim()]) {
      productIds[productId.trim()] = { planId, billingPeriod, purchasable: false }
    }
  }

  if (Object.keys(productIds).length === 0) return null

  const duplicateNewProducts = Object.keys(paidProducts).length !== PAID_PRODUCT_ENVIRONMENTS
    .filter(([environmentName]) => Boolean(process.env[environmentName]?.trim())).length
  if (duplicateNewProducts) return null

  return {
    secretApiKey,
    webhookSecret,
    apiBaseUrl: process.env.REVENUECAT_API_BASE_URL || 'https://api.revenuecat.com/v1',
    entitlementIds: {
      basic: process.env.REVENUECAT_BASIC_ENTITLEMENT_ID || 'basic',
      standard: process.env.REVENUECAT_STANDARD_ENTITLEMENT_ID || 'standard',
      pro: process.env.REVENUECAT_PRO_ENTITLEMENT_ID || 'pro',
      premium: process.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID || 'premium',
    },
    productIds,
  }
}

export function isRevenueCatConfigured(): boolean {
  return getRevenueCatConfig() !== null
}

export function isRevenueCatWebCheckoutEnabled(): boolean {
  if (process.env.KAYVEN_WEB_CHECKOUT_ENABLED !== 'true') return false
  const config = getRevenueCatConfig()
  if (!config?.webhookSecret || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY) return false

  return PAID_PRODUCT_ENVIRONMENTS.every(([environmentName]) => {
    const productId = process.env[environmentName]?.trim()
    const mapping = productId ? config.productIds[productId] : null
    const publicIdName = `NEXT_PUBLIC_${environmentName}`
    return Boolean(productId && process.env[publicIdName]?.trim() === productId && mapping?.purchasable)
  })
}
