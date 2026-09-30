import type { PlanId } from './plans'
import type { SubscriptionStatus, UserSubscription } from './server'

export type BillingProviderName = 'revenuecat' | 'apple' | 'google_play' | 'web' | 'razorpay'

export interface ProviderSubscriptionState {
  provider: BillingProviderName
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  productId?: string | null
  status: SubscriptionStatus
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
}

export interface BillingProvider {
  readonly name: BillingProviderName
  getCustomerSubscriptionState(customerId: string): Promise<ProviderSubscriptionState | null>
  verifyEntitlements(state: ProviderSubscriptionState): Promise<boolean>
  mapProviderProductToPlan(productId: string): PlanId | null
}

export function toSubscriptionRecord(
  userId: string,
  state: ProviderSubscriptionState,
  planId: PlanId,
): Omit<UserSubscription, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: userId,
    provider: state.provider,
    provider_customer_id: state.providerCustomerId || null,
    provider_subscription_id: state.providerSubscriptionId || null,
    plan_id: planId,
    status: state.status,
    current_period_start: state.currentPeriodStart || null,
    current_period_end: state.currentPeriodEnd || null,
    cancel_at_period_end: state.cancelAtPeriodEnd || false,
  }
}
