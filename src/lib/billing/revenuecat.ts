import type { BillingProvider, ProviderSubscriptionState } from './provider'
import type { PlanId } from './plans'
import { getRevenueCatConfig, type RevenueCatConfig } from './revenuecat-config'
import { mapRevenueCatProductToPlan, normalizeRevenueCatSubscriber, type RevenueCatSubscriberPayload } from './revenuecat-normalizer'

export class RevenueCatProvider implements BillingProvider {
  readonly name = 'revenuecat' as const

  private readonly config: RevenueCatConfig | null

  constructor(config = getRevenueCatConfig()) {
    this.config = config
  }

  isConfigured(): boolean {
    return this.config !== null
  }

  async getCustomerSubscriptionState(customerId: string): Promise<ProviderSubscriptionState | null> {
    if (!this.config) return null

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/subscribers/${encodeURIComponent(customerId)}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.config.secretApiKey}` },
        cache: 'no-store',
      })
      if (response.status === 404) return null
      if (!response.ok) {
        console.error('[KAYVEN Billing] RevenueCat customer lookup failed', { status: response.status })
        throw new Error('RevenueCat customer lookup failed')
      }
      const payload = await response.json() as { subscriber?: RevenueCatSubscriberPayload }
      if (!payload.subscriber) throw new Error('RevenueCat returned no subscriber data')
      return normalizeRevenueCatSubscriber(customerId, payload.subscriber, this.config).state
    } catch (error) {
      console.error('[KAYVEN Billing] RevenueCat customer lookup failed')
      throw error
    }
  }

  async verifyEntitlements(state: ProviderSubscriptionState): Promise<boolean> {
    return Boolean(state.status === 'active' || state.status === 'trialing')
  }

  mapProviderProductToPlan(productId: string): PlanId | null {
    if (!this.config) return null
    const plan = mapRevenueCatProductToPlan(productId, this.config)
    return plan === 'free' ? null : plan
  }

  normalizeSubscriber(customerId: string, subscriber: RevenueCatSubscriberPayload) {
    if (!this.config) return { planId: 'free' as const, state: null }
    return normalizeRevenueCatSubscriber(customerId, subscriber, this.config)
  }
}
