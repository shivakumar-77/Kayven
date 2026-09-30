import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { crypto } from '@/lib/server/crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Razorpay webhook is not configured.' }, { status: 503 })
  }

  // Get the raw body and headers for signature verification
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') || ''

  // Verify Razorpay webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  // Use timing-safe comparison to prevent timing attacks
  let isValid = true
  if (signature.length !== expectedSignature.length) {
    isValid = false
  } else {
    for (let i = 0; i < signature.length; i++) {
      if (signature.charCodeAt(i) !== expectedSignature.charCodeAt(i)) {
        isValid = false
        break
      }
    }
  }

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Webhook storage is not configured.' }, { status: 503 })
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch (error) {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  const { id: provider_event_id, type: event_type, payload } = event
  const { entity: subscription_data } = payload

  // Check for idempotency - have we already processed this event?
  const { data: existingEvent, error: idempotencyError } = await admin
    .from('billing_webhook_events')
    .select('id, status')
    .eq('provider', 'razorpay')
    .eq('provider_event_id', provider_event_id)
    .single()

  if (idempotencyError && idempotencyError.code !== 'PGRST116') {
    // PGRST116 means no rows returned, which is OK
    console.error('[KAYVEN Billing] Error checking webhook idempotency', { error: idempotencyError })
    return NextResponse.json({ error: 'Idempotency check failed.' }, { status: 500 })
  }

  if (existingEvent) {
    // Already processed this event
    if (existingEvent.status === 'processed') {
      console.info('[KAYVEN Billing] Razorpay webhook already processed', {
        provider_event_id,
        event_type
      })
      return NextResponse.json({ ok: true, duplicate: true })
    } else if (existingEvent.status === 'failed') {
      // Retry failed events
      console.info('[KAYVEN Billing] Retrying failed Razorpay webhook', {
        provider_event_id,
        event_type
      })
    } else {
      // Still processing
      console.info('[KAYVEN Billing] Razorpay webhook still processing', {
        provider_event_id,
        event_type
      })
      return NextResponse.json({ ok: true, duplicate: true })
    }
  }

  // Mark event as processing
  const { error: insertError } = await admin
    .from('billing_webhook_events')
    .insert({
      provider: 'razorpay',
      provider_event_id,
      event_type,
      provider_user_id: subscription_data?.customer_id || null,
      status: 'processing'
    })

  if (insertError) {
    console.error('[KAYVEN Billing] Failed to insert webhook event', { error: insertError })
    return NextResponse.json({ error: 'Failed to record webhook event.' }, { status: 500 })
  }

  try {
    // Process the webhook event based on type
    switch (event_type) {
      case 'subscription.authenticated':
      case 'subscription.activated':
        await handleSubscriptionActivated(admin, subscription_data)
        break
      case 'subscription.charged':
        await handleSubscriptionCharged(admin, subscription_data)
        break
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(admin, subscription_data)
        break
      case 'subscription.paused':
        await handleSubscriptionPaused(admin, subscription_data)
        break
      case 'subscription.resumed':
        await handleSubscriptionResumed(admin, subscription_data)
        break
      case 'subscription.completed':
        await handleSubscriptionCompleted(admin, subscription_data)
        break
      case 'subscription.payment_failed':
        await handleSubscriptionPaymentFailed(admin, subscription_data)
        break
      default:
        console.info('[KAYVEN Billing] Unhandled Razorpay webhook event', { event_type })
        // Still mark as processed for unhandled events
        break
    }

    // Mark event as processed
    await admin
      .from('billing_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('provider', 'razorpay')
      .eq('provider_event_id', provider_event_id)

    console.info('[KAYVEN Billing] Razorpay webhook processed successfully', {
      provider_event_id,
      event_type
    })
    return NextResponse.json({ ok: true, duplicate: false })
  } catch (error) {
    console.error('[KAYVEN Billing] Razorpay webhook processing failed', {
      error,
      provider_event_id,
      event_type
    })

    // Mark event as failed
    await admin
      .from('billing_webhook_events')
      .update({ status: 'failed' })
      .eq('provider', 'razorpay')
      .eq('provider_event_id', provider_event_id)

    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}

// Helper functions to handle different subscription events
async function handleSubscriptionActivated(admin: any, subscriptionData: any) {
  // Update subscription status to active
  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      provider_customer_id: subscriptionData.customer_id || null,
      provider_subscription_id: subscriptionData.id || null,
      updated_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subscriptionData.id)
}

async function handleSubscriptionCharged(admin: any, subscriptionData: any) {
  // Update subscription period info
  await admin
    .from('subscriptions')
    .update({
      current_period_start: subscriptionData.current_period_start
        ? new Date(subscriptionData.current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscriptionData.current_period_end
        ? new Date(subscriptionData.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subscriptionData.id)
}

async function handleSubscriptionCancelled(admin: any, subscriptionData: any) {
  // Update subscription status to canceled
  await admin
    .from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subscriptionData.id)
}

async function handleSubscriptionPaused(admin: any, subscriptionData: any) {
  // Update subscription status to past_due (or we could add a paused status)
  await admin
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subscriptionData.id)
}

async function handleSubscriptionResumed(admin: any, subscriptionData: any) {
  // Update subscription status to active
  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subscriptionData.id)
}

async function handleSubscriptionCompleted(admin: any, subscriptionData: any) {
  // Update subscription status to expired
  await admin
    .from('subscriptions')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subscriptionData.id)
}

async function handleSubscriptionPaymentFailed(admin: any, subscriptionData: any) {
  // Update subscription status to past_due
  await admin
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subscriptionData.id)
}