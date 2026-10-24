import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { runMeteredAI } from '@/lib/billing/server'
import { meteredAIFailureResponse } from '@/lib/server/ai-quota-response'
import { isValidAIIdempotencyKey } from '@/lib/server/ai-idempotency'

function isUsableInsightsResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return typeof result.headline === 'string'
    && typeof result.score === 'number' && Number.isFinite(result.score)
    && typeof result.calories_avg === 'number' && Number.isFinite(result.calories_avg)
    && typeof result.protein_avg === 'number' && Number.isFinite(result.protein_avg)
    && typeof result.best_day === 'string'
    && typeof result.consistency === 'number' && Number.isFinite(result.consistency)
    && Array.isArray(result.insights)
    && result.insights.every((insight) => {
      if (typeof insight !== 'object' || insight === null || Array.isArray(insight)) return false
      const item = insight as Record<string, unknown>
      return typeof item.icon === 'string' && typeof item.title === 'string' && typeof item.body === 'string'
    })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const idempotencyKey = req.headers.get('Idempotency-Key')
    if (!isValidAIIdempotencyKey(idempotencyKey)) return NextResponse.json({ error: 'AI_IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 })

    const { weeklyLogs, targets, profile } = await req.json()
    if (!Array.isArray(weeklyLogs) || weeklyLogs.length > 31 || !targets) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'No key' }, { status: 503 })

    const summary = weeklyLogs.map((day: any) =>
      `${day.date}: ${Math.round(day.cal)}kcal, ${Math.round(day.protein)}g protein, ${Math.round(day.carb)}g carbs, ${Math.round(day.fat)}g fat`
    ).join('\n')

    const prompt = `You are an expert nutrition coach analyzing a week of data for a ${profile?.gender || 'person'} with goal: ${profile?.goal || 'lose weight'}.

Weekly nutrition data:
${summary}

Daily targets: ${targets.cal}kcal, ${targets.protein}g protein, ${targets.carb}g carbs, ${targets.fat}g fat

Respond ONLY with this JSON:
{
  "headline": "Short week summary (max 10 words)",
  "score": 75,
  "calories_avg": 0,
  "protein_avg": 0,
  "insights": [
    {"icon": "💪", "title": "Strength", "body": "What they did well (max 20 words)"},
    {"icon": "⚡", "title": "Opportunity", "body": "What to improve (max 20 words)"},
    {"icon": "🎯", "title": "This week focus", "body": "One specific action (max 20 words)"}
  ],
  "best_day": "Mon",
  "consistency": 80
}`

    const outcome = await runMeteredAI({
      supabase,
      userId: user.id,
      feature: 'advanced_progress',
      idempotencyKey,
      execute: async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
          signal: AbortSignal.timeout(45000),
        })
        if (!response.ok) return { value: null, billable: false }
        const data = await response.json()
        const text = data.content?.[0]?.text
        if (typeof text !== 'string' || !text.trim()) return { value: null, billable: false }
        let result = null
        try {
          const parsed: unknown = JSON.parse(text.replace(/```json|```/g, '').trim())
          result = isUsableInsightsResult(parsed) ? parsed : null
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
