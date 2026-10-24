import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { runMeteredAI } from '@/lib/billing/server'
import { meteredAIFailureResponse } from '@/lib/server/ai-quota-response'
import { isValidAIIdempotencyKey } from '@/lib/server/ai-idempotency'

function normalizePlan(plan: any) {
  if (!plan || !Array.isArray(plan.meals) || plan.meals.length < 4) return null
  const requiredMeals = ['Breakfast', 'Lunch', 'Snack', 'Dinner']
  const meals = requiredMeals.map(type => plan.meals.find((meal: any) => String(meal.type).toLowerCase() === type.toLowerCase()))
  if (meals.some(meal => !meal || !Array.isArray(meal.options) || meal.options.length !== 4)) return null
  if (meals.some(meal => new Set(meal.options.map((option: any) => String(option.name || '').trim().toLowerCase())).size !== 4)) return null

  return {
    ...plan,
    meals: meals.map((meal: any) => ({
      ...meal,
      type: requiredMeals.find(type => type.toLowerCase() === String(meal.type).toLowerCase()) || meal.type,
      options: meal.options.map((option: any) => ({
        name: String(option.name || 'Meal option'),
        ingredients: Array.isArray(option.ingredients) ? option.ingredients.map((ingredient: any) => ({ name: String(ingredient.name || 'Ingredient'), quantity: String(ingredient.quantity || '100 g') })) : [],
        nutrition: {
          calories: Number(option.nutrition?.calories) || 0,
          protein: Number(option.nutrition?.protein) || 0,
          carbs: Number(option.nutrition?.carbs) || 0,
          fat: Number(option.nutrition?.fat) || 0,
          fiber: Number(option.nutrition?.fiber) || 0
        },
        recipe: Array.isArray(option.recipe) ? option.recipe.map((step: unknown) => String(step)).filter(Boolean).slice(0, 8) : [],
        tip: option.tip ? String(option.tip) : ''
      }))
    }))
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const idempotencyKey = req.headers.get('Idempotency-Key')
    if (!isValidAIIdempotencyKey(idempotencyKey)) return NextResponse.json({ error: 'AI_IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 })

    const { targets, profile, preferences, customPrompt } = await req.json()
    if ((!customPrompt && !targets) || (customPrompt !== undefined && (typeof customPrompt !== 'string' || customPrompt.length > 4000))) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'No key' }, { status: 503 })

    const prompt = customPrompt || `Create a full day meal plan for a ${profile?.gender||'person'}, goal: ${profile?.goal||'lose weight'}.
Targets: ${targets.cal}kcal, ${targets.protein}g protein, ${targets.carb}g carbs, ${targets.fat}g fat.
Cuisine: Indian / Mixed. Return valid JSON only with meals array containing Breakfast, Lunch, Snack, Dinner.
Each meal has: type, time, emoji, exactly four genuinely different options. Each option has name, ingredients (name and exact quantity), nutrition (calories, protein, carbs, fat, fiber), recipe steps, and tip.
Also include: summary, day_total_cal, day_total_protein, shopping_list, hydration_tip, pro_tip.`

    type PlanOutcome = { response: NextResponse } | { result: unknown }
    const outcome = await runMeteredAI<PlanOutcome>({
      supabase,
      userId: user.id,
      feature: 'ai_coach',
      idempotencyKey,
      execute: async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY as string,'anthropic-version':'2023-06-01'},
          body: JSON.stringify({
            model:'claude-sonnet-4-6',
            max_tokens:2500,
            messages:[{role:'user',content:prompt+'\n\nReturn ONLY valid JSON. No markdown, no explanation.'}]
          }),
          signal: AbortSignal.timeout(60000)
        })
        if (!response.ok) return { value: { response: NextResponse.json({ error: 'AI error' }, { status: 502 }) }, billable: false }
        const data = await response.json()
        const text = data.content?.[0]?.text??''
        let result = null
        try {
          result = JSON.parse(text.replace(/```json|```/g,'').trim())
        } catch { result = null }
        const normalized = normalizePlan(result)
        if (!normalized) return { value: { response: NextResponse.json({ error: 'Could not generate a complete four-option plan' }, { status: 422 }) }, billable: false }
        return { value: { result: normalized }, billable: true }
      },
    })
    if (outcome.status !== 'ok') return meteredAIFailureResponse(outcome)
    if ('response' in outcome.value) return outcome.value.response
    return NextResponse.json({ result: outcome.value.result })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
