import type { NextRequest } from 'next/server'
import { getRevenueCatConfig } from './revenuecat-config'
import { normalizeRevenueCatStatus, type RevenueCatEventPayload } from './revenuecat-normalizer'
import type { RevenueCatProvider } from './revenuecat'

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'BILLING_ISSUE',
  'EXPIRATION',
  'PRODUCT_CHANGE',
  'TRANSFER',
])

export interface VerifiedRevenueCatEvent {
  id: string
  type: string
  appUserId: string
  payload: RevenueCatEventPayload
}

export function verifyRevenueCatWebhookAuthorization(request: NextRequest, secret: string): boolean {
  const authorization = request.headers.get('authorization')
  return Boolean(authorization && authorization === `Bearer ${secret}`)
}

export function parseRevenueCatWebhook(body: unknown): VerifiedRevenueCatEvent | null {
  if (!body || typeof body !== 'object') return null
  const event = (body as { event?: RevenueCatEventPayload }).event
  if (!event?.id || !event.type || !event.app_user_id) return null
  return { id: event.id, type: event.type, appUserId: event.app_user_id, payload: event }
}

export async function syncRevenueCatWebhookEvent(
  supabase: any,
  provider: RevenueCatProvider,
  verifiedEvent: VerifiedRevenueCatEvent,
): Promise<{ ok: boolean; duplicate: boolean }> {
  const config = getRevenueCatConfig()
  if (!config) return { ok: false, duplicate: false }

  const { data: existing, error: lookupError } = await supabase
    .from('billing_webhook_events')
    .select('id, status')
    .eq('provider', 'revenuecat')
    .eq('provider_event_id', verifiedEvent.id)
    .maybeSingle()

  if (lookupError) return { ok: false, duplicate: false }
  if (existing?.status === 'processed') return { ok: true, duplicate: true }

  const eventWrite = existing
    ? await supabase
      .from('billing_webhook_events')
      .update({ status: 'processing' })
      .eq('id', existing.id)
    : await supabase
      .from('billing_webhook_events')
      .insert({
        provider: 'revenuecat',
        provider_event_id: verifiedEvent.id,
        event_type: verifiedEvent.type,
        provider_user_id: verifiedEvent.appUserId,
        status: 'processing',
      })

  if (eventWrite.error) return { ok: false, duplicate: Boolean(existing) }

  if (!SUBSCRIPTION_EVENT_TYPES.has(verifiedEvent.type.toUpperCase())) {
    const processed = await supabase
      .from('billing_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('provider', 'revenuecat')
      .eq('provider_event_id', verifiedEvent.id)
    return { ok: !processed.error, duplicate: Boolean(existing) }
  }

  const subscriberState = provider.normalizeSubscriber(verifiedEvent.appUserId, {
    entitlements: verifiedEvent.payload.entitlement_ids?.reduce<Record<string, { product_identifier?: string | null; expires_date?: string | null }>>((result, entitlement) => {
      result[entitlement] = {
        product_identifier: verifiedEvent.payload.product_id || null,
        expires_date: verifiedEvent.payload.expiration_at_ms ? new Date(verifiedEvent.payload.expiration_at_ms).toISOString() : null,
      }
      return result
    }, {}),
    subscriptions: verifiedEvent.payload.product_id ? {
      [verifiedEvent.payload.product_id]: {
        expires_date: verifiedEvent.payload.expiration_at_ms ? new Date(verifiedEvent.payload.expiration_at_ms).toISOString() : null,
        unsubscribe_detected_at: normalizeRevenueCatStatus(verifiedEvent.payload) === 'canceled' ? new Date().toISOString() : null,
        billing_issues_detected_at: normalizeRevenueCatStatus(verifiedEvent.payload) === 'past_due' ? new Date().toISOString() : null,
      },
    } : {},
  })

  const status = normalizeRevenueCatStatus(verifiedEvent.payload)
  const productPlan = provider.mapProviderProductToPlan(verifiedEvent.payload.product_id || '')
  const planId = subscriberState.planId === 'free' && status !== 'expired'
    ? productPlan || 'free'
    : subscriberState.planId
  const state = subscriberState.state || (planId !== 'free' ? {
    provider: 'revenuecat' as const,
    providerCustomerId: verifiedEvent.appUserId,
    productId: verifiedEvent.payload.product_id || null,
    status,
    currentPeriodEnd: verifiedEvent.payload.expiration_at_ms ? new Date(verifiedEvent.payload.expiration_at_ms).toISOString() : null,
  } : null)
  const periodStillActive = Boolean(state?.currentPeriodEnd && new Date(state.currentPeriodEnd).getTime() > Date.now())
  const persistedStatus = status === 'canceled' && periodStillActive ? 'active' : status
  const subscription = state ? {
    user_id: verifiedEvent.appUserId,
    provider: 'revenuecat',
    provider_customer_id: state.providerCustomerId || verifiedEvent.appUserId,
    provider_subscription_id: verifiedEvent.payload.original_transaction_id || verifiedEvent.payload.transaction_id || verifiedEvent.id,
    plan_id: planId,
    status: persistedStatus,
    current_period_start: state.currentPeriodStart || null,
    current_period_end: state.currentPeriodEnd || null,
    cancel_at_period_end: state.cancelAtPeriodEnd || status === 'canceled',
  } : null

  let syncError: unknown = null
  if (subscription) {
    const { data: existingSubscription, error: subscriptionLookupError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('provider', 'revenuecat')
      .eq('provider_subscription_id', subscription.provider_subscription_id)
      .maybeSingle()
    if (subscriptionLookupError) {
      syncError = subscriptionLookupError
    } else {
      const write = existingSubscription
        ? await supabase.from('subscriptions').update(subscription).eq('id', existingSubscription.id)
        : await supabase.from('subscriptions').insert(subscription)
      syncError = write.error
    }
  } else {
    const write = await supabase
      .from('subscriptions')
      .update({ status, plan_id: 'free', updated_at: new Date().toISOString() })
      .eq('user_id', verifiedEvent.appUserId)
      .eq('provider', 'revenuecat')
    syncError = write.error
  }

  const eventStatus = await supabase
    .from('billing_webhook_events')
    .update({ status: syncError ? 'failed' : 'processed', processed_at: syncError ? null : new Date().toISOString() })
    .eq('provider', 'revenuecat')
    .eq('provider_event_id', verifiedEvent.id)

  return { ok: !syncError && !eventStatus.error, duplicate: Boolean(existing) }
}
