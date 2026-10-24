import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { RevenueCatProvider } from '@/lib/billing/revenuecat'
import { getRevenueCatConfig } from '@/lib/billing/revenuecat-config'
import { syncSubscriptionState } from '@/lib/billing/sync'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null
  const supabase = await createSupabaseServerClient(accessToken)
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken || undefined)

  if (authError || !user) {
    return NextResponse.json({ error: 'Please sign in to refresh subscription state.' }, { status: 401 })
  }

  const config = getRevenueCatConfig()
  if (!config) {
    return NextResponse.json({ error: 'Subscription refresh is not configured.' }, { status: 503 })
  }

  try {
    const provider = new RevenueCatProvider(config)
    const synced = await syncSubscriptionState(user.id, provider, user.id)
    if (!synced) {
      return NextResponse.json({ error: 'Provider subscription state could not be verified.' }, { status: 502 })
    }
    return NextResponse.json({ synced: true })
  } catch (error) {
    console.error('[KAYVEN Billing] Subscription refresh failed', error)
    return NextResponse.json({ error: 'Unable to refresh subscription state.' }, { status: 502 })
  }
}
