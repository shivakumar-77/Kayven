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
): Promise<{ ok: boolean; duplicate: boolean; stale: boolean }> {
  const config = getRevenueCatConfig()
  if (!config) return { ok: false, duplicate: false, stale: false }

  const { data: existing, error: lookupError } = await supabase
    .from('billing_webhook_events')
    .select('id, status')
    .eq('provider', 'revenuecat')
    .eq('provider_event_id', verifiedEvent.id)
    .maybeSingle()

  if (lookupError) return { ok: false, duplicate: false, stale: false }
  if (existing?.status === 'processed') return { ok: true, duplicate: true, stale: false }
  if (existing?.status === 'processing') return { ok: false, duplicate: true, stale: false }

  if (existing) {
    const claim = await supabase
      .from('billing_webhook_events')
      .update({ status: 'processing', processed_at: null })
      .eq('id', existing.id)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle()
    if (claim.error || !claim.data) return { ok: false, duplicate: true, stale: false }
  } else {
    const claim = await supabase
      .from('billing_webhook_events')
      .insert({
        provider: 'revenuecat',
        provider_event_id: verifiedEvent.id,
        event_type: verifiedEvent.type,
        provider_user_id: verifiedEvent.appUserId,
        status: 'processing',
      })
      .select('id')
      .maybeSingle()
    if (claim.error) return { ok: false, duplicate: claim.error.code === '23505', stale: false }
    if (!claim.data) return { ok: false, duplicate: false, stale: false }
  }

  if (!SUBSCRIPTION_EVENT_TYPES.has(verifiedEvent.type.toUpperCase())) {
    const processed = await supabase
      .from('billing_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('provider', 'revenuecat')
      .eq('provider_event_id', verifiedEvent.id)
    return { ok: !processed.error, duplicate: Boolean(existing), stale: false }
  }

  const eventTimestampMs = verifiedEvent.payload.event_timestamp_ms
  if (!Number.isSafeInteger(eventTimestampMs) || !eventTimestampMs || eventTimestampMs <= 0) {
    await supabase
      .from('billing_webhook_events')
      .update({ status: 'failed', processed_at: null })
      .eq('provider', 'revenuecat')
      .eq('provider_event_id', verifiedEvent.id)
    return { ok: false, duplicate: Boolean(existing), stale: false }
  }

  const productId = verifiedEvent.payload.product_id || ''
  const status = normalizeRevenueCatStatus(verifiedEvent.payload)
  const productPlan = provider.mapProviderProductToPlan(productId)
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

  const knownProduct = Boolean(productPlan || subscriberState.state)
  const providerSubscriptionId = verifiedEvent.payload.original_transaction_id
    || verifiedEvent.payload.transaction_id
  let syncError: unknown = null
  let stale = false

  if (knownProduct) {
    if (!providerSubscriptionId) {
      syncError = new Error('RevenueCat subscription event has no transaction identifier')
    } else {
      const state = subscriberState.state
      const planId = status === 'expired'
        ? 'free'
        : subscriberState.planId === 'free'
          ? productPlan || 'free'
          : subscriberState.planId
      const persistedStatus = status === 'canceled' && state?.currentPeriodEnd
        && new Date(state.currentPeriodEnd).getTime() > Date.now()
        ? 'active'
        : status
      const write = await supabase.rpc('apply_revenuecat_subscription_event', {
        p_user_id: verifiedEvent.appUserId,
        p_provider_subscription_id: providerSubscriptionId,
        p_plan_id: planId,
        p_billing_period: state?.billingPeriod || config.productIds[productId]?.billingPeriod || null,
        p_status: persistedStatus,
        p_current_period_start: state?.currentPeriodStart
          || (verifiedEvent.payload.purchased_at_ms ? new Date(verifiedEvent.payload.purchased_at_ms).toISOString() : null),
        p_current_period_end: state?.currentPeriodEnd
          || (verifiedEvent.payload.expiration_at_ms ? new Date(verifiedEvent.payload.expiration_at_ms).toISOString() : null),
        p_cancel_at_period_end: Boolean(state?.cancelAtPeriodEnd || status === 'canceled'),
        p_event_timestamp_ms: eventTimestampMs,
      })
      syncError = write.error
      stale = !write.error && write.data === false
    }
  }

  const eventStatus = await supabase
    .from('billing_webhook_events')
    .update({ status: syncError ? 'failed' : 'processed', processed_at: syncError ? null : new Date().toISOString() })
    .eq('provider', 'revenuecat')
    .eq('provider_event_id', verifiedEvent.id)

  return { ok: !syncError && !eventStatus.error, duplicate: Boolean(existing), stale }
}
