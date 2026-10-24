import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { runMeteredAI } from '@/lib/billing/server'
import { meteredAIFailureResponse } from '@/lib/server/ai-quota-response'
import { isValidAIIdempotencyKey } from '@/lib/server/ai-idempotency'

function isUsableSuggestionsResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  const validStatuses = ['on_track', 'low_protein', 'low_calories', 'over_calories', 'great']
  return typeof result.tip === 'string'
    && validStatuses.includes(String(result.status))
    && Array.isArray(result.suggestions)
    && result.suggestions.every((suggestion) => {
      if (typeof suggestion !== 'object' || suggestion === null || Array.isArray(suggestion)) return false
      const item = suggestion as Record<string, unknown>
      return typeof item.name === 'string'
        && typeof item.reason === 'string'
        && typeof item.cal === 'number' && Number.isFinite(item.cal)
        && typeof item.protein === 'number' && Number.isFinite(item.protein)
    })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const idempotencyKey = req.headers.get('Idempotency-Key')
    if (!isValidAIIdempotencyKey(idempotencyKey)) return NextResponse.json({ error: 'AI_IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 })

    const { totals, targets, logs } = await req.json()
    if (!totals || !targets || !Array.isArray(logs) || logs.length > 200) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'No key' }, { status: 503 })

    const remaining = {
      cal: Math.max(0, targets.cal - totals.cal),
      protein: Math.max(0, targets.protein - totals.protein),
      carb: Math.max(0, targets.carb - totals.carb),
      fat: Math.max(0, targets.fat - totals.fat),
    }

    const prompt = `You are a nutrition coach. A user has eaten today:
- Calories: ${Math.round(totals.cal)} / ${targets.cal} kcal (${Math.round(remaining.cal)} remaining)
- Protein: ${Math.round(totals.protein)}g / ${targets.protein}g (${Math.round(remaining.protein)}g remaining)
- Carbs: ${Math.round(totals.carb)}g / ${targets.carb}g (${Math.round(remaining.carb)}g remaining)
- Fat: ${Math.round(totals.fat)}g / ${targets.fat}g (${Math.round(remaining.fat)}g remaining)
Foods eaten: ${logs.slice(-5).map(l => l.name).join(', ') || 'nothing yet'}

Respond ONLY with this JSON, no markdown:
{
  "tip": "One short motivational tip (max 12 words)",
  "suggestions": [
    {"name": "food name", "reason": "why (max 8 words)", "cal": 0, "protein": 0},
    {"name": "food name", "reason": "why (max 8 words)", "cal": 0, "protein": 0},
    {"name": "food name", "reason": "why (max 8 words)", "cal": 0, "protein": 0}
  ],
  "status": "on_track" | "low_protein" | "low_calories" | "over_calories" | "great"
}`

    const outcome = await runMeteredAI({
      supabase,
      userId: user.id,
      feature: 'ai_coach',
      idempotencyKey,
      execute: async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
          signal: AbortSignal.timeout(45000),
        })
        if (!response.ok) return { value: null, billable: false }

        const data = await response.json()
        const text = data.content?.[0]?.text
        if (typeof text !== 'string' || !text.trim()) return { value: null, billable: false }
        let result = null
        try {
          const parsed: unknown = JSON.parse(text.replace(/```json|```/g, '').trim())
          result = isUsableSuggestionsResult(parsed) ? parsed : null
        } catch { result = null }
        return { value: result, billable: result !== null }
      },
    })
    if (outcome.status !== 'ok') return meteredAIFailureResponse(outcome)
    if (!outcome.value) return NextResponse.json({ error: 'AI_RESULT_UNAVAILABLE', message: 'AI could not produce a result. Please try again.' }, { status: 502 })
    return NextResponse.json({ result: outcome.value })
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
