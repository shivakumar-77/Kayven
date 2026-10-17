import { getRelevantMemories } from './kayven-memory'
import type { KAYVENMemoryRecord } from './kayven-memory-schema'

type DateRange = 'today' | '7d' | '30d'

export interface IntelligenceContextOptions {
  range?: DateRange
}

export interface KayvenIntelligenceContext {
  generatedAt: string
  range: DateRange
  user: {
    profile: Record<string, unknown> | null
    goals: {
      goal: string | null
      weightGoalKg: number | null
      calorieTarget: number | null
      proteinTargetG: number | null
      carbTargetG: number | null
      fatTargetG: number | null
      fiberTargetG: number | null
    }
    preferences: Record<string, unknown>
  }
  nutrition: {
    today: NutritionSummary
    recentMeals: NormalizedFoodLog[]
    macroSummary: NutritionSummary
    weeklySummary: DailyNutritionSummary[]
    calorieTarget: number | null
    proteinTarget: number | null
  }
  body: {
    currentWeightKg: number | null
    weightTrendKg: number | null
    weights: NormalizedWeightLog[]
    measurements: Record<string, unknown>[]
  }
  fitness: {
    recentWorkouts: Record<string, unknown>[]
    workoutFrequency: number
    recentActivity: Record<string, unknown>[]
  }
  hydration: {
    todayMl: number
    targetMl: number | null
  }
  mealPlanning: {
    currentPlan: Record<string, unknown> | null
    upcomingMeals: Record<string, unknown>[]
  }
  supplements: {
    currentItems: Record<string, unknown>[]
  }
  generatedInsights: {
    existingInsights: Record<string, unknown>[]
  }
  dataSources: Record<string, boolean>
  memory: KAYVENMemoryRecord[]
}

interface NutritionSummary {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
  daysWithLogs: number
}

interface DailyNutritionSummary extends NutritionSummary {
  date: string
}

interface NormalizedFoodLog {
  id: string
  date: string
  name: string
  quantity: number
  unit: string
  mealType: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
}

interface NormalizedWeightLog {
  id: string
  date: string
  weightKg: number
}

const FOOD_FIELDS = 'id,logged_at,name,qty,unit,cal,protein,carb,fat,fiber,meal_type'
const WEIGHT_FIELDS = 'id,logged_at,weight_kg'
const OPTIONAL_TABLES = [
  'measurements', 'water_logs', 'workout_logs', 'workout_templates',
  'supplements', 'meal_plans', 'insights'
]

function numeric(value: unknown): number {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

const KAYVEN_TIME_ZONE = 'Asia/Kolkata'

function dateOnly(value: unknown): string {
  const date = new Date(String(value ?? ''))

  if (Number.isNaN(date.getTime())) {
    return String(value ?? '').slice(0, 10)
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KAYVEN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getKayvenToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KAYVEN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function startDate(range: DateRange): string {
  const [year, month, day] = getKayvenToday()
    .split('-')
    .map(Number)

  const date = new Date(Date.UTC(year, month - 1, day))

  date.setUTCDate(
    date.getUTCDate() -
      (range === 'today' ? 0 : range === '7d' ? 6 : 29),
  )

  return date.toISOString().slice(0, 10)
}

function emptySummary(): NutritionSummary {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, daysWithLogs: 0 }
}

function removeOwnership(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(({ user_id: _userId, ...row }) => row)
}

function summarize(logs: NormalizedFoodLog[]): NutritionSummary {
  const summary = emptySummary()
  const days = new Set<string>()
  logs.forEach(log => {
    summary.calories += log.calories
    summary.proteinG += log.proteinG
    summary.carbsG += log.carbsG
    summary.fatG += log.fatG
    summary.fiberG += log.fiberG
    days.add(log.date)
  })
  summary.daysWithLogs = days.size
  return summary
}

async function optionalQuery(supabase: any, table: string, query: (builder: any) => any) {
  try {
    const result = await query(supabase.from(table))
    if (result.error) {
      console.warn('[Kayven Intelligence] Optional source unavailable', { table })
      return { data: [], available: false }
    }
    return { data: result.data || [], available: true }
  } catch {
    console.warn('[Kayven Intelligence] Optional source query failed', { table })
    return { data: [], available: false }
  }
}

export async function getKayvenIntelligenceContext(
  supabase: any,
  userId: string,
  options: IntelligenceContextOptions = {}
): Promise<KayvenIntelligenceContext> {
  const range = options.range || '7d'
  const from = startDate(range)
  const today = getKayvenToday()

  const [memories, profileResult, foodResult, weightResult, ...optionalResults] = await Promise.all([
    getRelevantMemories(supabase, userId, { minImportance: 2, limit: 20 }),
    supabase.from('profiles').select('id,name,dob,age,gender,height,goal,cal_target,protein_target,carb_target,fat_target,fiber_target,weight_goal,water_goal,reminder_times,created_at').eq('id', userId).maybeSingle(),
    supabase.from('food_logs').select(FOOD_FIELDS).eq('user_id', userId).gte('logged_at', from).lte('logged_at', today).order('logged_at', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    supabase.from('weight_logs').select(WEIGHT_FIELDS).eq('user_id', userId).gte('logged_at', from).lte('logged_at', today).order('logged_at', { ascending: true }).limit(100),
    ...OPTIONAL_TABLES.map(table => optionalQuery(supabase, table, builder => {
      const fields = table === 'water_logs' ? 'logged_at,amount_ml' : '*'
      let query = builder.select(fields).eq('user_id', userId)
      if (table === 'measurements' || table === 'water_logs' || table === 'insights') query = query.gte('logged_at', from).lte('logged_at', today)
      if (table === 'workout_logs') query = query.gte('started_at', `${from}T00:00:00.000Z`).lte('started_at', `${today}T23:59:59.999Z`)
      if (table === 'supplements') query = query.eq('active', true)
      return query.limit(200)
    }))
  ])

  if (profileResult.error) throw profileResult.error
  if (foodResult.error) throw foodResult.error
  if (weightResult.error) throw weightResult.error

  const profile = profileResult.data || null
  const foodLogs: NormalizedFoodLog[] = (foodResult.data || []).map((log: any) => ({
    id: String(log.id), date: dateOnly(log.logged_at), name: String(log.name || ''),
    quantity: numeric(log.qty), unit: String(log.unit || 'g'), mealType: String(log.meal_type || 'other'),
    calories: numeric(log.cal), proteinG: numeric(log.protein), carbsG: numeric(log.carb),
    fatG: numeric(log.fat), fiberG: numeric(log.fiber)
  }))
  const weights: NormalizedWeightLog[] = (weightResult.data || []).map((log: any) => ({
    id: String(log.id), date: dateOnly(log.logged_at), weightKg: numeric(log.weight_kg)
  }))
  const optional = Object.fromEntries(OPTIONAL_TABLES.map((table, index) => [table, optionalResults[index]]))
  const daily = Array.from(new Set(foodLogs.map(log => log.date))).sort().map(date => ({ date, ...summarize(foodLogs.filter(log => log.date === date)) }))
  const water = optional.water_logs?.data || []
  const workouts = optional.workout_logs?.data || []
  const currentWeight = weights.at(-1)?.weightKg ?? null
  const firstWeight = weights[0]?.weightKg ?? null

  console.info('[Kayven Intelligence] Context generated', { range, sourceCount: 3 + OPTIONAL_TABLES.filter(table => optional[table]?.available).length })
  return {
    generatedAt: new Date().toISOString(), range,
    user: {
      profile: profile ? { id: profile.id, name: profile.name, dob: profile.dob, age: profile.age, gender: profile.gender, height: numeric(profile.height) || null } : null,
      goals: { goal: profile?.goal || null, weightGoalKg: profile?.weight_goal == null ? null : numeric(profile.weight_goal), calorieTarget: profile?.cal_target == null ? null : numeric(profile.cal_target), proteinTargetG: profile?.protein_target == null ? null : numeric(profile.protein_target), carbTargetG: profile?.carb_target == null ? null : numeric(profile.carb_target), fatTargetG: profile?.fat_target == null ? null : numeric(profile.fat_target), fiberTargetG: profile?.fiber_target == null ? null : numeric(profile.fiber_target) },
      preferences: { reminderTimes: profile?.reminder_times || [] }
    },
    nutrition: { today: summarize(foodLogs.filter(log => log.date === today)), recentMeals: foodLogs, macroSummary: summarize(foodLogs), weeklySummary: daily, calorieTarget: profile?.cal_target == null ? null : numeric(profile.cal_target), proteinTarget: profile?.protein_target == null ? null : numeric(profile.protein_target) },
    body: { currentWeightKg: currentWeight, weightTrendKg: currentWeight == null || firstWeight == null ? null : currentWeight - firstWeight, weights, measurements: removeOwnership(optional.measurements?.data || []) },
    fitness: { recentWorkouts: removeOwnership(workouts), workoutFrequency: new Set(workouts.map((workout: any) => dateOnly(workout.started_at))).size, recentActivity: [] },
    hydration: { todayMl: water.filter((entry: any) => dateOnly(entry.logged_at) === today).reduce((total: number, entry: any) => total + numeric(entry.amount_ml), 0), targetMl: profile?.water_goal == null ? null : numeric(profile.water_goal) },
    mealPlanning: { currentPlan: optional.meal_plans?.data?.[0] ? removeOwnership([optional.meal_plans.data[0]])[0] : null, upcomingMeals: [] },
    supplements: { currentItems: removeOwnership(optional.supplements?.data || []) },
    generatedInsights: { existingInsights: removeOwnership(optional.insights?.data || []) },
    memory: memories.map(({ user_id: _userId, ...memory }) => memory),
    dataSources: Object.fromEntries([['profiles', true], ['food_logs', true], ['weight_logs', true], ...OPTIONAL_TABLES.map(table => [table, !!optional[table]?.available])])
  }
}