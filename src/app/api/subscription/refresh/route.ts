import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { RevenueCatProvider } from '@/lib/billing/revenuecat'
import { getRevenueCatConfig } from '@/lib/billing/revenuecat-config'
import { syncSubscriptionState } from '@/lib/billing/sync'
import { RateLimiterMemory } from 'rate-limiter-flexible'

// Rate limiter for subscription refresh: 2 requests per 10 seconds per IP
const subscriptionRefreshRateLimiter = new RateLimiterMemory({
  points: 2, // 2 requests
  duration: 10, // per 10 seconds
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null
  const supabase = createSupabaseServerClient(accessToken)
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken || undefined)

  if (authError || !user) {
    return NextResponse.json({ error: 'Please sign in to refresh subscription state.' }, { status: 401 })
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.socket.remoteAddress || 'anonymous'
  try {
    await subscriptionRefreshRateLimiter.consume(ip)
  } catch (err) {
    return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 })
  }

  const config = getRevenueCatConfig()
  if (!config) {
    return NextResponse.json({ synced: false, reason: 'Billing is not configured.' })
  }

  const provider = new RevenueCatProvider(config)
  const synced = await syncSubscriptionState(supabase, user.id, provider, user.id)
  return NextResponse.json({ synced })
}
