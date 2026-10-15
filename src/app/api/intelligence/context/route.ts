import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { getKayvenIntelligenceContext } from '@/lib/server/kayven-intelligence-context'
import { RateLimiterMemory } from 'rate-limiter-flexible'

// Rate limiter for intelligence context: 5 requests per 10 seconds per IP
const contextRateLimiter = new RateLimiterMemory({
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
      await contextRateLimiter.consume(ip)
    } catch (err) {
      return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 })
    }

    const requestedRange = new URL(request.url).searchParams.get('range')
    const range = requestedRange === 'today' || requestedRange === '30d' ? requestedRange : '7d'
    const context = await getKayvenIntelligenceContext(supabase, user.id, { range })
    return NextResponse.json({ context })
  } catch (error) {
    console.error('[Kayven Intelligence] Context generation failed', { message: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json({ error: 'Unable to generate intelligence context' }, { status: 500 })
  }
}