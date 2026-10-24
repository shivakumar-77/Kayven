import { mapRevenueCatEntitlementsToPlan, mapRevenueCatProductToPlan, normalizeRevenueCatStatus } from './revenuecat-normalizer'
import { parseRevenueCatWebhook } from './revenuecat-webhook'
import type { RevenueCatConfig } from './revenuecat-config'

const config: RevenueCatConfig = {
  secretApiKey: 'test-key',
  webhookSecret: 'test-webhook',
  apiBaseUrl: 'https://example.test',
  entitlementIds: { premium: 'premium', pro: 'pro' },
  productIds: {
    premium_monthly: 'premium',
    premium_yearly: 'premium',
    pro_monthly: 'pro',
    pro_yearly: 'pro',
  },
}

export function runRevenueCatTests(): void {
  if (mapRevenueCatProductToPlan('unknown', config) !== 'free') throw new Error('unknown product must resolve to free')
  if (mapRevenueCatProductToPlan('premium_monthly', config) !== 'premium') throw new Error('premium product mapping failed')
  if (mapRevenueCatProductToPlan('pro_yearly', config) !== 'pro') throw new Error('pro product mapping failed')

  const expires = new Date(Date.now() + 60_000).toISOString()
  const plan = mapRevenueCatEntitlementsToPlan({ premium: { expires_date: expires }, pro: { expires_date: expires } }, config)
  if (plan !== 'pro') throw new Error('pro must win over premium')
  if (mapRevenueCatEntitlementsToPlan({ premium: { expires_date: new Date(Date.now() - 60_000).toISOString() } }, config) !== 'free') throw new Error('expired entitlement must resolve to free')

  if (normalizeRevenueCatStatus({ type: 'BILLING_ISSUE' }) !== 'past_due') throw new Error('billing issue mapping failed')
  if (normalizeRevenueCatStatus({ type: 'CANCELLATION' }) !== 'canceled') throw new Error('cancellation mapping failed')
  if (normalizeRevenueCatStatus({ type: 'UNCANCELLATION' }) !== 'active') throw new Error('uncancellation must restore active access')
  if (normalizeRevenueCatStatus({ type: 'EXPIRATION' }) !== 'expired') throw new Error('expiration mapping failed')
  if (normalizeRevenueCatStatus({ type: 'RENEWAL' }) !== 'active') throw new Error('renewal mapping failed')

  const parsed = parseRevenueCatWebhook({ event: { id: 'evt_1', type: 'RENEWAL', app_user_id: 'user_1' } })
  if (!parsed || parsed.appUserId !== 'user_1') throw new Error('valid webhook was not parsed')
  if (parseRevenueCatWebhook({ event: { id: 'evt_2', type: 'RENEWAL' } })) throw new Error('incomplete webhook must be rejected')
}
