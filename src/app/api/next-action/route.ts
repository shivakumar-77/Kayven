import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { getKayvenIntelligenceContext } from '@/lib/server/kayven-intelligence-context'
import { buildKayvenUserState } from '@/lib/server/kayven-user-state'
import { getNextBestAction } from '@/lib/server/next-best-action'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
