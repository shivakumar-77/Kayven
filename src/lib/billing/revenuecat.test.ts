import { mapRevenueCatEntitlementsToPlan, mapRevenueCatProductToPlan, normalizeRevenueCatStatus } from './revenuecat-normalizer'
import { parseRevenueCatWebhook, syncRevenueCatWebhookEvent } from './revenuecat-webhook'
import type { RevenueCatConfig } from './revenuecat-config'
import { RevenueCatProvider } from './revenuecat'
import { hasUnapprovedOfferPhase } from './revenuecat-offers'
import { getPublicRevenueCatWebProductMapping, isRevenueCatCheckoutAllowed } from './revenuecat-products'
import { isRevenueCatWebCheckoutEnabled } from './revenuecat-config'

const config: RevenueCatConfig = {
  secretApiKey: 'test-key',
  webhookSecret: 'test-webhook',
  apiBaseUrl: 'https://example.test',
  entitlementIds: { basic: 'basic', standard: 'standard', premium: 'premium', pro: 'pro' },
  productIds: {
    premium_monthly: { planId: 'premium', billingPeriod: 'monthly', purchasable: false },
    premium_yearly: { planId: 'premium', billingPeriod: 'yearly', purchasable: false },
    pro_monthly: { planId: 'pro', billingPeriod: 'monthly', purchasable: false },
    pro_yearly: { planId: 'pro', billingPeriod: 'yearly', purchasable: false },
    basic_monthly: { planId: 'basic', billingPeriod: 'monthly', purchasable: true },
    standard_yearly: { planId: 'standard', billingPeriod: 'yearly', purchasable: true },
  },
}

export async function runRevenueCatTests(): Promise<void> {
  if (hasUnapprovedOfferPhase({ freeTrialPhase: {} }) !== true) throw new Error('unapproved free trial phase must be rejected')
  if (hasUnapprovedOfferPhase({ introPricePhase: {} }) !== true) throw new Error('unapproved introductory price phase must be rejected')
  if (hasUnapprovedOfferPhase({}) !== false) throw new Error('regular pricing must not be treated as an unapproved offer')
  const publicProductEnv = [
    'NEXT_PUBLIC_REVENUECAT_BASIC_MONTHLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_BASIC_YEARLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_STANDARD_MONTHLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_STANDARD_YEARLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_PRO_AI_MONTHLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID',
  ] as const
  const originalProductEnv = publicProductEnv.map(name => process.env[name])
  try {
    publicProductEnv.forEach(name => { delete process.env[name] })
    process.env.NEXT_PUBLIC_REVENUECAT_BASIC_MONTHLY_PRODUCT_ID = 'basic_month'
    process.env.NEXT_PUBLIC_REVENUECAT_BASIC_YEARLY_PRODUCT_ID = 'basic_year'
    process.env.NEXT_PUBLIC_REVENUECAT_STANDARD_MONTHLY_PRODUCT_ID = 'standard_month'
    process.env.NEXT_PUBLIC_REVENUECAT_STANDARD_YEARLY_PRODUCT_ID = 'standard_year'
    process.env.NEXT_PUBLIC_REVENUECAT_PRO_AI_MONTHLY_PRODUCT_ID = 'pro_month'
    process.env.NEXT_PUBLIC_REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID = 'pro_year'
    if (getPublicRevenueCatWebProductMapping('basic_month')?.billingPeriod !== 'monthly') throw new Error('monthly product mapping failed')
    if (getPublicRevenueCatWebProductMapping('basic_year')?.billingPeriod !== 'yearly') throw new Error('yearly product mapping failed')
    if (getPublicRevenueCatWebProductMapping('standard_month')?.planId !== 'standard') throw new Error('Standard product mapping failed')
    if (getPublicRevenueCatWebProductMapping('pro_year')?.planId !== 'pro') throw new Error('Pro AI product mapping failed')
    process.env.NEXT_PUBLIC_REVENUECAT_BASIC_MONTHLY_PRODUCT_ID = ' basic_month '
    if (getPublicRevenueCatWebProductMapping('basic_month')?.planId !== 'basic') throw new Error('product IDs should be normalized consistently')
    process.env.NEXT_PUBLIC_REVENUECAT_BASIC_MONTHLY_PRODUCT_ID = 'basic_month'
    process.env.NEXT_PUBLIC_REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID = 'basic_month'
    if (getPublicRevenueCatWebProductMapping('basic_month') !== null) throw new Error('duplicate public product IDs must not map to a plan')
  } finally {
    publicProductEnv.forEach((name, index) => {
      const value = originalProductEnv[index]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    })
  }
  const checkoutProductEnv = [
    'KAYVEN_WEB_CHECKOUT_ENABLED',
    'REVENUECAT_SECRET_API_KEY',
    'REVENUECAT_WEBHOOK_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_REVENUECAT_WEB_API_KEY',
    'REVENUECAT_BASIC_MONTHLY_PRODUCT_ID',
    'REVENUECAT_BASIC_YEARLY_PRODUCT_ID',
    'REVENUECAT_STANDARD_MONTHLY_PRODUCT_ID',
    'REVENUECAT_STANDARD_YEARLY_PRODUCT_ID',
    'REVENUECAT_PRO_AI_MONTHLY_PRODUCT_ID',
    'REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_BASIC_MONTHLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_BASIC_YEARLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_STANDARD_MONTHLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_STANDARD_YEARLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_PRO_AI_MONTHLY_PRODUCT_ID',
    'NEXT_PUBLIC_REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID',
  ] as const
  const originalCheckoutEnv = checkoutProductEnv.map(name => process.env[name])
  try {
    checkoutProductEnv.forEach(name => { delete process.env[name] })
    process.env.REVENUECAT_SECRET_API_KEY = 'test-only-secret'
    process.env.REVENUECAT_WEBHOOK_SECRET = 'test-only-webhook'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-role'
    process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY = 'test-only-web-key'
    const productIds = ['basic_month', 'basic_year', 'standard_month', 'standard_year', 'pro_month', 'pro_year']
    const serverProductNames = checkoutProductEnv.slice(5, 11)
    const publicProductNames = checkoutProductEnv.slice(11)
    serverProductNames.forEach((name, index) => { process.env[name] = productIds[index] })
    publicProductNames.forEach((name, index) => { process.env[name] = productIds[index] })
    if (isRevenueCatWebCheckoutEnabled()) throw new Error('checkout must remain disabled unless its explicit feature flag is enabled')
    process.env.KAYVEN_WEB_CHECKOUT_ENABLED = 'true'
    if (!isRevenueCatWebCheckoutEnabled()) throw new Error('complete, matching checkout configuration should pass the server readiness gate')
    delete process.env.NEXT_PUBLIC_REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID
    if (isRevenueCatWebCheckoutEnabled()) throw new Error('checkout must be disabled if a public product mapping is missing')
    process.env.NEXT_PUBLIC_REVENUECAT_PRO_AI_YEARLY_PRODUCT_ID = 'mismatched-product'
    if (isRevenueCatWebCheckoutEnabled()) throw new Error('checkout must be disabled if server and public product IDs differ')
  } finally {
    checkoutProductEnv.forEach((name, index) => {
      const value = originalCheckoutEnv[index]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    })
  }
  if (!isRevenueCatCheckoutAllowed({ currentPlan: 'free', billingPurchasesEnabled: true })) {
    throw new Error('a verified Free account should pass the checkout readiness check')
  }
  if (isRevenueCatCheckoutAllowed({ currentPlan: 'free', billingPurchasesEnabled: false })) {
    throw new Error('checkout must remain disabled when the server feature gate is off')
  }
  if (isRevenueCatCheckoutAllowed({ currentPlan: 'pro', billingPurchasesEnabled: true })) {
    throw new Error('paid users must not enter the unverified plan-change flow')
  }
  if (isRevenueCatCheckoutAllowed({ currentPlan: 'free', billingPurchasesEnabled: true, statusUnavailable: true })) {
    throw new Error('unavailable subscription state must deny checkout')
  }
  if (mapRevenueCatProductToPlan('unknown', config) !== 'free') throw new Error('unknown product must resolve to free')
  if (mapRevenueCatProductToPlan('premium_monthly', config) !== 'premium') throw new Error('premium product mapping failed')
  if (mapRevenueCatProductToPlan('pro_yearly', config) !== 'pro') throw new Error('pro product mapping failed')
  if (mapRevenueCatProductToPlan('basic_monthly', config) !== 'basic') throw new Error('Basic product mapping failed')
  if (mapRevenueCatProductToPlan('standard_yearly', config) !== 'standard') throw new Error('Standard product mapping failed')

  const expires = new Date(Date.now() + 60_000).toISOString()
  const plan = mapRevenueCatEntitlementsToPlan({ premium: { expires_date: expires }, pro: { expires_date: expires } }, config)
  if (plan !== 'pro') throw new Error('pro must win over premium')
  if (mapRevenueCatEntitlementsToPlan({ premium: { expires_date: new Date(Date.now() - 60_000).toISOString() } }, config) !== 'free') throw new Error('expired entitlement must resolve to free')
  if (mapRevenueCatEntitlementsToPlan({ basic: { expires_date: new Date(Date.now() + 60_000).toISOString() } }, config) !== 'basic') throw new Error('Basic entitlement mapping failed')

  if (normalizeRevenueCatStatus({ type: 'BILLING_ISSUE' }) !== 'past_due') throw new Error('billing issue mapping failed')
  if (normalizeRevenueCatStatus({ type: 'CANCELLATION' }) !== 'canceled') throw new Error('cancellation mapping failed')
  if (normalizeRevenueCatStatus({ type: 'UNCANCELLATION' }) !== 'active') throw new Error('uncancellation must restore active access')
  if (normalizeRevenueCatStatus({ type: 'EXPIRATION' }) !== 'expired') throw new Error('expiration mapping failed')
  if (normalizeRevenueCatStatus({ type: 'RENEWAL' }) !== 'active') throw new Error('renewal mapping failed')

  const parsed = parseRevenueCatWebhook({ event: { id: 'evt_1', type: 'RENEWAL', app_user_id: 'user_1' } })
  if (!parsed || parsed.appUserId !== 'user_1') throw new Error('valid webhook was not parsed')
  if (parseRevenueCatWebhook({ event: { id: 'evt_2', type: 'RENEWAL' } })) throw new Error('incomplete webhook must be rejected')

  const envNames = ['REVENUECAT_SECRET_API_KEY', 'REVENUECAT_BASIC_MONTHLY_PRODUCT_ID'] as const
  const previousEnv = envNames.map(name => process.env[name])
  try {
    process.env.REVENUECAT_SECRET_API_KEY = 'test-only-secret'
    process.env.REVENUECAT_BASIC_MONTHLY_PRODUCT_ID = 'test-basic-monthly'
    const duplicateClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'stored-event', status: 'processed' }, error: null }),
            }),
          }),
        }),
      }),
    }
    const duplicateResult = await syncRevenueCatWebhookEvent(
      duplicateClient,
      new RevenueCatProvider(config),
      { id: 'evt_1', type: 'RENEWAL', appUserId: 'user_1', payload: { id: 'evt_1', type: 'RENEWAL', app_user_id: 'user_1' } },
    )
    if (!duplicateResult.ok || !duplicateResult.duplicate) throw new Error('processed RevenueCat webhook duplicates must be acknowledged idempotently')

    const invalidTimestampClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: { id: 'stored-event' }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      }),
    }
    const invalidTimestampResult = await syncRevenueCatWebhookEvent(
      invalidTimestampClient,
      new RevenueCatProvider(config),
      { id: 'evt_missing_timestamp', type: 'RENEWAL', appUserId: 'user_1', payload: { id: 'evt_missing_timestamp', type: 'RENEWAL', app_user_id: 'user_1' } },
    )
    if (invalidTimestampResult.ok) throw new Error('webhook events without a provider timestamp must not update subscription state')
  } finally {
    envNames.forEach((name, index) => {
      const value = previousEnv[index]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    })
  }
}
