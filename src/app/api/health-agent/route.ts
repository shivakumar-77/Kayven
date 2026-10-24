import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { getKayvenIntelligenceContext } from '@/lib/server/kayven-intelligence-context'
import { buildKayvenUserState } from '@/lib/server/kayven-user-state'
import { getPersonalHealthAgentState } from '@/lib/server/personal-health-agent'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getKayvenIntelligenceContext(supabase, user.id, { range: '30d' })
    const userState = buildKayvenUserState(context)
    const state = getPersonalHealthAgentState(context, userState)
    console.info('[Kayven Health Agent] State generated', { status: state.status, actionType: state.action.actionType })
    return NextResponse.json({ state })
  } catch (error) {
    console.error('[Kayven Health Agent] State generation failed', { message: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json({ error: 'Unable to generate personal health state' }, { status: 500 })
  }
}
