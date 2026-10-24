export type KAYVENToolName =
  | 'get_user_profile'
  | 'get_today_nutrition'
  | 'get_weight_progress'
  | 'get_hydration'
  | 'get_recent_workouts'
  | 'get_supplements'
  | 'get_current_meal_plan'

export interface KAYVENToolInput {
  userId: string
  supabase: any
  context: Record<string, unknown>
}

export interface KAYVENToolResult {
  success: boolean
  data: unknown
  error?: string
}

export interface ToolDecision {
  canHandle: boolean
  tool?: KAYVENToolName
  reason: string
}

export function decideTool(intent: string, message: string): ToolDecision {
  const text = message.toLowerCase()

  if (/calories.*today|how.*eat.*today|today.*calories|calorie.*intake/i.test(text)) {
    return { canHandle: true, tool: 'get_today_nutrition', reason: 'Direct nutrition lookup' }
  }

  if (/protein.*target|calorie.*target|target.*protein|target.*calorie/i.test(text)) {
    return { canHandle: true, tool: 'get_user_profile', reason: 'Profile goal lookup' }
  }

  if (/current.*weight|what.*weight|weight.*now|how.*heavy/i.test(text)) {
    return { canHandle: true, tool: 'get_weight_progress', reason: 'Current weight lookup' }
  }

  if (/water.*left|hydration.*left|water.*intake|how.*much.*water/i.test(text)) {
    return { canHandle: true, tool: 'get_hydration', reason: 'Hydration lookup' }
  }

  if (/workout.*recently|recent.*workout|how.*many.*workout|workouts.*done/i.test(text)) {
    return { canHandle: true, tool: 'get_recent_workouts', reason: 'Workout history lookup' }
  }

  if (/supplement.*taking|supplement.*list|am.*i.*taking|current.*supplement/i.test(text)) {
    return { canHandle: true, tool: 'get_supplements', reason: 'Supplement list lookup' }
  }

  if (/meal.*plan|what.*meal|in.*meal.*plan|current.*meal/i.test(text)) {
    return { canHandle: true, tool: 'get_current_meal_plan', reason: 'Meal plan data lookup' }
  }

  return { canHandle: false, reason: 'Requires complex reasoning or personalization' }
}

export async function executeTool(toolName: KAYVENToolName, input: KAYVENToolInput): Promise<KAYVENToolResult> {
  const { userId, supabase, context } = input

  try {
    switch (toolName) {
      case 'get_user_profile':
        return await toolGetUserProfile(userId, supabase)

      case 'get_today_nutrition':
        return await toolGetTodayNutrition(userId, context)

      case 'get_weight_progress':
        return await toolGetWeightProgress(userId, context)

      case 'get_hydration':
        return await toolGetHydration(userId, context)

      case 'get_recent_workouts':
        return await toolGetRecentWorkouts(userId, context)

      case 'get_supplements':
        return await toolGetSupplements(userId, context)

      case 'get_current_meal_plan':
        return await toolGetCurrentMealPlan(userId, context)

      default:
        return { success: false, data: null, error: 'Unknown tool' }
    }
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Tool execution failed'
    }
  }
}

async function toolGetUserProfile(userId: string, supabase: any): Promise<KAYVENToolResult> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('goal, cal_target, protein_target, carb_target, fat_target')
      .eq('id', userId)
      .maybeSingle()

    if (error) return { success: false, data: null, error: error.message }
    if (!profile) return { success: false, data: null, error: 'Profile not found' }

    return {
      success: true,
      data: {
        goal: profile.goal || 'Not set',
        targets: {
          calories: profile.cal_target ?? null,
          protein_g: profile.protein_target ?? null,
          carbs_g: profile.carb_target ?? null,
          fat_g: profile.fat_target ?? null
        }
      }
    }
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function toolGetTodayNutrition(userId: string, context: Record<string, unknown>): Promise<KAYVENToolResult> {
  try {
    const nutrition = (context as any)?.nutrition || {}
    const today = nutrition.today || {
      meals: 0,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0
    }

    return {
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        calories: today.calories || 0,
        protein_g: today.protein_g || 0,
        carbs_g: today.carbs_g || 0,
        fat_g: today.fat_g || 0,
        meals_logged: today.meals || 0,
        target_calories: nutrition.calorieTarget || null
      }
    }
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function toolGetWeightProgress(userId: string, context: Record<string, unknown>): Promise<KAYVENToolResult> {
  try {
    const body = (context as any)?.body || {}
    const weights = body.weights || []
    const latest = weights[0] || null

    return {
      success: true,
      data: {
        current_weight_kg: body.currentWeightKg || null,
        latest_entry: latest ? { date: latest.date, weight_kg: latest.weight_kg } : null,
        trend_kg: body.weightTrendKg || null,
        recent_entries: weights.slice(0, 7).map((w: any) => ({ date: w.date, weight_kg: w.weight_kg }))
      }
    }
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function toolGetHydration(userId: string, context: Record<string, unknown>): Promise<KAYVENToolResult> {
  try {
    const hydration = (context as any)?.hydration || {}
    const today = hydration.today || { consumed_ml: 0, target_ml: 0 }

    return {
      success: true,
      data: {
        consumed_ml: today.consumed_ml || 0,
        target_ml: today.target_ml || 2000,
        remaining_ml: Math.max(0, (today.target_ml || 2000) - (today.consumed_ml || 0)),
        percentage: Math.min(100, Math.round(((today.consumed_ml || 0) / (today.target_ml || 2000)) * 100))
      }
    }
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function toolGetRecentWorkouts(userId: string, context: Record<string, unknown>): Promise<KAYVENToolResult> {
  try {
    const fitness = (context as any)?.fitness || {}
    const workouts = fitness.recentWorkouts || []
    const count = workouts.length

    return {
      success: true,
      data: {
        recent_count: count,
        workouts: workouts.slice(0, 5).map((w: any) => ({
          date: w.date,
          type: w.type,
          duration_minutes: w.duration_minutes,
          exercise_count: w.exerciseCount || 0
        })),
        frequency: fitness.workoutFrequency || 'unknown'
      }
    }
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function toolGetSupplements(userId: string, context: Record<string, unknown>): Promise<KAYVENToolResult> {
  try {
    const supplements = (context as any)?.supplements || {}
    const active = supplements.active || []

    return {
      success: true,
      data: {
        active_supplements: active.map((s: any) => ({
          name: s.name,
          type: s.type,
          dose: s.dose,
          frequency: s.frequency
        })),
        count: active.length
      }
    }
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function toolGetCurrentMealPlan(userId: string, context: Record<string, unknown>): Promise<KAYVENToolResult> {
  try {
    const mealPlanning = (context as any)?.mealPlanning || {}
    const plan = mealPlanning.currentPlan || null

    if (!plan) {
      return { success: true, data: { message: 'No meal plan created yet' } }
    }

    return {
      success: true,
      data: {
        created_date: plan.createdDate || null,
        meals: plan.meals ? plan.meals.map((m: any) => ({ type: m.type, count: m.options?.length || 0 })) : [],
        summary: `Meal plan with ${plan.meals?.length || 0} meal types`
      }
    }
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
