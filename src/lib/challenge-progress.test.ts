import { calculateWeeklyChallengeProgress } from './challenge-progress'

export function runWeeklyChallengeTests(): void {
  const result = calculateWeeklyChallengeProgress({
    today: '2026-10-21',
    calorieTarget: 2000,
    proteinTarget: 100,
    waterTarget: 2000,
    foodLogs: [
      { logged_at: '2026-10-18', meal_type: 'lunch', cal: 500, protein: 100 },
      { logged_at: '2026-10-19', meal_type: 'breakfast', cal: 300, protein: 50 },
      { logged_at: '2026-10-19', meal_type: 'lunch', cal: 600, protein: 30 },
      { logged_at: '2026-10-19', meal_type: 'dinner', cal: 500, protein: 25 },
      { logged_at: '2026-10-20', meal_type: 'breakfast', cal: 500, protein: 40 },
      { logged_at: '2026-10-20', meal_type: 'lunch', cal: 600, protein: 35 },
      { logged_at: '2026-10-20', meal_type: 'dinner', cal: 700, protein: 30 },
      { logged_at: '2026-10-21', meal_type: 'lunch', cal: 600, protein: 25 },
      { logged_at: '2026-10-21', meal_type: 'snack', cal: 500, protein: 25 },
      { logged_at: '2026-10-22', cal: 100, protein: 100 },
    ],
    workoutLogs: [
      { started_at: '2026-10-18T12:00:00.000Z' },
      { started_at: '2026-10-20T12:00:00.000Z' },
      { started_at: '2026-10-20T15:00:00.000Z' },
      { started_at: '2026-10-21T12:00:00.000Z' },
      { started_at: '2026-10-21T15:00:00.000Z' },
    ],
    waterLogs: [
      { logged_at: '2026-10-19', amount_ml: 1200 },
      { logged_at: '2026-10-19', amount_ml: 800 },
      { logged_at: '2026-10-21', amount_ml: 2100 },
      { logged_at: '2026-10-22', amount_ml: 3000 },
    ],
    weightLogs: [
      { logged_at: '2026-10-18' },
      { logged_at: '2026-10-19' },
      { logged_at: '2026-10-20' },
      { logged_at: '2026-10-22' },
    ],
  })

  const expected: Record<string, number> = {
    wc_log5meals: 2,
    wc_hit_protein: 2,
    wc_workouts3: 3,
    wc_water5days: 2,
    wc_weight7days: 2,
    wc_no_junk: 3,
  }
  for (const [id, value] of Object.entries(expected)) {
    if (result[id] !== value) {
      throw new Error(`${id}: expected ${value}, got ${result[id]}`)
    }
  }

  const noTargets = calculateWeeklyChallengeProgress({
    today: '2026-10-21',
    calorieTarget: null,
    proteinTarget: null,
    waterTarget: null,
    foodLogs: [{ logged_at: '2026-10-19', meal_type: 'other', cal: 0, protein: 0 }],
    workoutLogs: [],
    waterLogs: [{ logged_at: '2026-10-19', amount_ml: 5000 }],
    weightLogs: [],
  })
  if (noTargets.wc_no_junk !== 0 || noTargets.wc_hit_protein !== 0 || noTargets.wc_water5days !== 0) {
    throw new Error('Challenges without configured targets must not be credited.')
  }
}
