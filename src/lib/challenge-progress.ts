import { WEEKLY_CHALLENGES } from './achievements'

type FoodLog = {
  logged_at: string
  meal_type?: string | null
  cal?: number | string | null
  protein?: number | string | null
}
type DatedLog = { logged_at: string }
type WorkoutLog = { started_at: string }
type WaterLog = { logged_at: string; amount_ml?: number | string | null }

export interface WeeklyChallengeInput {
  foodLogs: FoodLog[]
  workoutLogs: WorkoutLog[]
  waterLogs: WaterLog[]
  weightLogs: DatedLog[]
  calorieTarget: number | string | null | undefined
  proteinTarget: number | string | null | undefined
  waterTarget: number | string | null | undefined
  today?: string
}

export function calculateWeeklyChallengeProgress(input: WeeklyChallengeInput): Record<string, number> {
  const today = input.today || new Date().toISOString().slice(0, 10)
  const monday = new Date(`${today}T00:00:00.000Z`)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const weekStart = monday.toISOString().slice(0, 10)
  const inCurrentWeek = (date: string) => date >= weekStart && date <= today
  const dailyMeals = new Map<string, { mealTypes: Set<string>; calories: number; protein: number }>()
  const dailyWater = new Map<string, number>()

  for (const log of input.foodLogs) {
    if (!inCurrentWeek(log.logged_at)) continue
    const totals = dailyMeals.get(log.logged_at) || { mealTypes: new Set<string>(), calories: 0, protein: 0 }
    if (log.meal_type && log.meal_type !== 'other') totals.mealTypes.add(log.meal_type)
    totals.calories += Number(log.cal) || 0
    totals.protein += Number(log.protein) || 0
    dailyMeals.set(log.logged_at, totals)
  }

  for (const log of input.waterLogs) {
    if (!inCurrentWeek(log.logged_at)) continue
    dailyWater.set(log.logged_at, (dailyWater.get(log.logged_at) || 0) + (Number(log.amount_ml) || 0))
  }

  const calorieTarget = Number(input.calorieTarget) || 0
  const proteinTarget = Number(input.proteinTarget) || 0
  const waterTarget = Number(input.waterTarget) || 0
  const progress: Record<string, number> = {
    wc_log5meals: [...dailyMeals.values()].filter(day => day.mealTypes.size >= 3).length,
    wc_hit_protein: proteinTarget > 0
      ? [...dailyMeals.values()].filter(day => day.protein >= proteinTarget).length
      : 0,
    wc_workouts3: input.workoutLogs.filter(log => inCurrentWeek(log.started_at.slice(0, 10))).length,
    wc_water5days: waterTarget > 0
      ? [...dailyWater.values()].filter(amount => amount >= waterTarget).length
      : 0,
    wc_weight7days: new Set(input.weightLogs.map(log => log.logged_at).filter(inCurrentWeek)).size,
    wc_no_junk: calorieTarget > 0
      ? [...dailyMeals.values()].filter(day => day.calories <= calorieTarget).length
      : 0,
  }

  return Object.fromEntries(WEEKLY_CHALLENGES.map(challenge => [
    challenge.id,
    Math.min(challenge.target, Math.max(0, progress[challenge.id] || 0)),
  ]))
}
