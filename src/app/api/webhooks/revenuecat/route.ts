import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { getRevenueCatConfig } from '@/lib/billing/revenuecat-config'
import { RevenueCatProvider } from '@/lib/billing/revenuecat'
import {
  parseRevenueCatWebhook,
  syncRevenueCatWebhookEvent,
  verifyRevenueCatWebhookAuthorization,
} from '@/lib/billing/revenuecat-webhook'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const config = getRevenueCatConfig()
  if (!config?.webhookSecret) {
    return NextResponse.json({ error: 'Billing webhook is not configured.' }, { status: 503 })
  }

  if (!verifyRevenueCatWebhookAuthorization(request, config.webhookSecret)) {
    return NextResponse.json({ error: 'Invalid webhook authorization.' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Billing webhook storage is not configured.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const event = parseRevenueCatWebhook(body)
  if (!event) {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  const result = await syncRevenueCatWebhookEvent(admin, new RevenueCatProvider(config), event)
  if (!result.ok) {
    console.error('[KAYVEN Billing] RevenueCat webhook synchronization failed', { eventType: event.type })
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }

  console.info('[KAYVEN Billing] RevenueCat webhook processed', {
    duplicate: result.duplicate,
    stale: result.stale,
    eventType: event.type,
  })
  return NextResponse.json({ ok: true, duplicate: result.duplicate })
}
