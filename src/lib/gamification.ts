// @ts-nocheck
import { supabase } from './supabase'
import { ACHIEVEMENTS } from './achievements'

export async function checkAndAwardAchievements(userId: string): Promise<string[]> {
  // Get current achievements
  const { data: existing } = await supabase.from('achievements').select('achievement_id').eq('user_id', userId)
  const earned = new Set((existing || []).map((a: any) => a.achievement_id))
  const newOnes: string[] = []

  async function award(id: string) {
    if (earned.has(id)) return
    const { error } = await supabase.from('achievements').insert({ user_id: userId, achievement_id: id })
    if (!error) { earned.add(id); newOnes.push(id) }
  }

  // Fetch all needed data in parallel
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

  const [
    { data: foodLogs },
    { data: workoutLogs },
    { data: weightLogs },
    { data: suppLogs },
    { data: prs },
    { data: profile },
    { data: streakData },
  ] = await Promise.all([
    supabase.from('food_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).limit(200),
    supabase.from('workout_logs').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(200),
    supabase.from('weight_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: true }),
    supabase.from('supplement_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).limit(100),
    supabase.from('exercise_prs').select('*').eq('user_id', userId),
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('streaks').select('*').eq('user_id', userId).single(),
  ])

  const food = foodLogs || []
  const workouts = workoutLogs || []
  const weights = weightLogs || []
  const supps = suppLogs || []
  const prList = prs || []
  const prof = profile

  // ── Nutrition ────────────────────────────────────────────
  if (food.length >= 1) await award('first_log')
  if (food.length >= 100) await award('log_100')

  // 7-day logging streak
  const loggedDays = new Set(food.map((l: any) => l.logged_at))
  let logStreak = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    if (loggedDogs(d.toISOString().slice(0, 10), loggedDays)) logStreak++
    else break
  }
  if (logStreak >= 7) await award('log_7_days')

  function loggedDogs(date: string, set: Set<string>) { return set.has(date) }

  // Protein goal hit
  if (prof?.protein_target) {
    const dayGroups: Record<string, number> = {}
    food.forEach((l: any) => { dayGroups[l.logged_at] = (dayGroups[l.logged_at] || 0) + l.protein })
    const hitProtein = Object.values(dayGroups).some(v => v >= prof.protein_target)
    if (hitProtein) await award('protein_goal')

    // All macros hit in a day
    const macroGroups: Record<string, { cal: number; protein: number; carb: number; fat: number }> = {}
    food.forEach((l: any) => {
      if (!macroGroups[l.logged_at]) macroGroups[l.logged_at] = { cal: 0, protein: 0, carb: 0, fat: 0 }
      macroGroups[l.logged_at].cal += l.cal
      macroGroups[l.logged_at].protein += l.protein
      macroGroups[l.logged_at].carb += l.carb
      macroGroups[l.logged_at].fat += l.fat
    })
    const allMacros = Object.values(macroGroups).some(d =>
      d.cal >= prof.cal_target * 0.9 && d.cal <= prof.cal_target * 1.1 &&
      d.protein >= prof.protein_target * 0.9 &&
      d.carb >= (prof.carb_target || 0) * 0.9 &&
      d.fat >= (prof.fat_target || 0) * 0.9
    )
    if (allMacros) await award('all_macros')
  }

  // Breakfast streak
  const breakfastDays = new Set(food.filter((l: any) => l.meal_type === 'breakfast').map((l: any) => l.logged_at))
  let bfStreak = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    if (breakfastDays.has(d.toISOString().slice(0, 10))) bfStreak++
    else break
  }
  if (bfStreak >= 7) await award('breakfast_7')

  // Night owl
  const nightLogs = food.filter((l: any) => {
    const h = new Date(l.created_at || l.logged_at).getHours()
    return h >= 0 && h < 4
  })
  if (nightLogs.length > 0) await award('night_owl')

  // ── Workout ──────────────────────────────────────────────
  if (workouts.length >= 1) await award('first_workout')
  if (workouts.length >= 5) await award('workout_5')
  if (workouts.length >= 20) await award('workout_20')
  if (workouts.length >= 50) await award('workout_50')
  if (workouts.length >= 100) await award('workout_100')

  // Volume
  const singleSession1000 = workouts.some((w: any) => (w.total_volume_kg || 0) >= 1000)
  if (singleSession1000) await award('volume_1000')

  const totalVolume = workouts.reduce((s: number, w: any) => s + (w.total_volume_kg || 0), 0)
  if (totalVolume >= 100000) await award('volume_100k')

  // PRs
  if (prList.length >= 1) await award('first_pr')
  if (prList.length >= 10) await award('pr_10')

  // ── Weight ───────────────────────────────────────────────
  if (weights.length >= 1) await award('first_weigh')
  if (weights.length >= 7) await award('weight_7days')

  if (weights.length >= 2 && prof?.goal === 'lose') {
    const diff = weights[0].weight_kg - weights[weights.length - 1].weight_kg
    if (diff >= 1) await award('lost_1kg')
    if (diff >= 5) await award('lost_5kg')
    if (diff >= 10) await award('lost_10kg')
    if (prof.weight_goal && weights[weights.length - 1].weight_kg <= prof.weight_goal) await award('reached_goal')
  }

  // ── Streaks ──────────────────────────────────────────────
  const streak = streakData?.current_streak || 0
  if (streak >= 3) await award('streak_3')
  if (streak >= 7) await award('streak_7')
  if (streak >= 30) await award('streak_30')
  if (streak >= 100) await award('streak_100')

  // ── Supplements ──────────────────────────────────────────
  if (supps.length >= 1) await award('first_supp')

  // ── Milestone ────────────────────────────────────────────
  await award('early_adopter')

  if (prof) {
    const fields = [prof.name, prof.dob, prof.height, prof.gender, prof.phone_number]
    if (fields.filter(Boolean).length === 5) await award('profile_complete')
  }

  return newOnes
}

export async function updateStreak(userId: string): Promise<{ current: number; longest: number; isNewDay: boolean }> {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const { data: streak } = await supabase.from('streaks').select('*').eq('user_id', userId).single()

  if (!streak) {
    await supabase.from('streaks').insert({ user_id: userId, current_streak: 1, longest_streak: 1, last_logged_date: today, total_days_logged: 1 })
    return { current: 1, longest: 1, isNewDay: true }
  }

  if (streak.last_logged_date === today) {
    return { current: streak.current_streak, longest: streak.longest_streak, isNewDay: false }
  }

  let newCurrent = streak.last_logged_date === yesterday ? streak.current_streak + 1 : 1
  const newLongest = Math.max(streak.longest_streak, newCurrent)
  const newTotal = (streak.total_days_logged || 0) + 1

  await supabase.from('streaks').update({
    current_streak: newCurrent, longest_streak: newLongest,
    last_logged_date: today, total_days_logged: newTotal
  }).eq('user_id', userId)

  return { current: newCurrent, longest: newLongest, isNewDay: true }
}
