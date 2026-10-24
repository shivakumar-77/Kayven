import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { getKayvenIntelligenceContext } from '@/lib/server/kayven-intelligence-context'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const requestedRange = new URL(request.url).searchParams.get('range')
    const range = requestedRange === 'today' || requestedRange === '30d' ? requestedRange : '7d'
    const context = await getKayvenIntelligenceContext(supabase, user.id, { range })
    return NextResponse.json({ context })
  } catch (error) {
    console.error('[Kayven Intelligence] Context generation failed', { message: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json({ error: 'Unable to generate intelligence context' }, { status: 500 })
  }
}