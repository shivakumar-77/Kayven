import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { getKayvenIntelligenceContext } from '@/lib/server/kayven-intelligence-context'
import { buildKayvenUserState } from '@/lib/server/kayven-user-state'
import { getNextBestAction } from '@/lib/server/next-best-action'
import { RateLimiterMemory } from 'rate-limiter-flexible'

// Rate limiter for next action: 5 requests per 10 seconds per IP
const nextActionRateLimiter = new RateLimiterMemory({
  points: 5, // 5 requests
  duration: 10, // per 10 seconds
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.socket.remoteAddress || 'anonymous'
    try {
      await nextActionRateLimiter.consume(ip)
    } catch (err) {
      return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 })
    }

    const context = await getKayvenIntelligenceContext(supabase, user.id, { range: '30d' })
    const userState = buildKayvenUserState(context)
    const action = getNextBestAction(context, userState)
    console.info('[Kayven Next Action] Recommendation generated', { actionType: action.actionType, priority: action.priority })
    return NextResponse.json({ action })
  } catch (error) {
    console.error('[Kayven Next Action] Recommendation failed', { message: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json({ error: 'Unable to generate recommendation' }, { status: 500 })
  }
}
