export type OnboardingGoal = 'lose' | 'build' | 'gain' | 'fitness' | 'maintain' | ''
export type MeasurementUnit = 'metric' | 'imperial'

export type OnboardingAnswers = {
  name: string
  goal: OnboardingGoal
  units: MeasurementUnit
  age: string
  height: string
  weight: string
  sex: 'female' | 'male' | 'prefer_not_to_say' | ''
  targetWeight: string
  targetDate: string
  activity: 'low' | 'light' | 'moderate' | 'high' | ''
  diet: 'none' | 'vegetarian' | 'vegan' | 'eggetarian' | 'non_vegetarian' | 'other' | ''
  dietOther: string
  allergies: string
  restrictions: string
  experience: 'beginner' | 'intermediate' | 'advanced' | ''
  trainingLocation: 'home' | 'gym' | ''
  equipment: string[]
  trainingDays: string
  workoutMinutes: string
  reminderInterest: boolean
}

export const INITIAL_ANSWERS: OnboardingAnswers = {
  name: '', goal: '', units: 'metric', age: '', height: '', weight: '', sex: '',
  targetWeight: '', targetDate: '', activity: '', diet: '', dietOther: '',
  allergies: '', restrictions: '', experience: '', trainingLocation: '',
  equipment: [], trainingDays: '', workoutMinutes: '', reminderInterest: false,
}

export const LAST_ONBOARDING_STEP = 8

export function isMissingOnboardingSchema(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown }
  if (candidate.code !== '42703' && candidate.code !== 'PGRST204') return false
  const description = [candidate.message, candidate.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  return /onboarding_data|onboarding_completed_at|current_weight_kg/.test(description)
}

export function safeReturnPath(candidate: string | null | undefined): string | null {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/auth') || candidate === '/onboarding' || candidate.startsWith('/onboarding?') || candidate.startsWith('/onboarding/') || candidate.includes('\\')) return null
  try {
    const parsed = new URL(candidate, 'https://kayven.invalid')
    return parsed.origin === 'https://kayven.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null
  } catch {
    return null
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function cleanAnswers(value: unknown): OnboardingAnswers {
  const raw = asObject(value)
  return {
    ...INITIAL_ANSWERS,
    ...raw,
    equipment: Array.isArray(raw.equipment) ? raw.equipment.filter((item): item is string => typeof item === 'string') : [],
    reminderInterest: raw.reminderInterest === true,
  } as OnboardingAnswers
}

export function restoreOnboarding(profile: Record<string, unknown> | null, metadataName = ''): {
  answers: OnboardingAnswers
  step: number
} {
  const saved = asObject(profile?.onboarding_data)
  const savedAnswers = asObject(saved.answers)
  const hasDraft = Object.keys(savedAnswers).length > 0
  if (hasDraft) {
    const answers = cleanAnswers(savedAnswers)
    const step = Number(saved.currentStep)
    return { answers, step: Number.isInteger(step) && step >= 1 && step <= LAST_ONBOARDING_STEP ? step : 1 }
  }

  const answers = { ...INITIAL_ANSWERS }
  answers.name = typeof profile?.name === 'string' ? profile.name : metadataName
  answers.age = profile?.age == null ? '' : String(profile.age)
  answers.height = profile?.height == null ? '' : String(profile.height)
  if (profile?.current_weight_kg != null) {
    const kg = Number(profile.current_weight_kg)
    answers.weight = Number.isFinite(kg) ? String(kg) : ''
  }
  return { answers, step: 0 }
}

export function heightInCm(answers: OnboardingAnswers): number {
  const value = Number(answers.height)
  return answers.units === 'imperial' ? value * 2.54 : value
}

export function weightInKg(value: string, units: MeasurementUnit): number {
  const weight = Number(value)
  return units === 'imperial' ? weight / 2.2046226218 : weight
}

export function validateOnboardingStep(step: number, answers: OnboardingAnswers): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 1 && !answers.goal) errors.goal = 'Choose the goal that best fits you.'
  if (step === 2) {
    const age = Number(answers.age)
    const height = heightInCm(answers)
    const weight = weightInKg(answers.weight, answers.units)
    if (!Number.isInteger(age) || age < 18 || age > 100) errors.age = 'Enter an age from 18 to 100. Calorie estimates are designed for adults.'
    if (!Number.isFinite(height) || height < 100 || height > 240) errors.height = answers.units === 'imperial' ? 'Enter a height from 39 to 95 inches.' : 'Enter a height from 100 to 240 cm.'
    if (!Number.isFinite(weight) || weight < 25 || weight > 300) errors.weight = answers.units === 'imperial' ? 'Enter a weight from 55 to 660 lb.' : 'Enter a weight from 25 to 300 kg.'
    if (answers.name.trim().length > 80) errors.name = 'Keep your name under 80 characters.'
  }
  if (step === 3 && answers.targetWeight.trim()) {
    const currentKg = weightInKg(answers.weight, answers.units)
    const targetKg = weightInKg(answers.targetWeight, answers.units)
    if (!Number.isFinite(targetKg) || targetKg < 25 || targetKg > 300) {
      errors.targetWeight = answers.units === 'imperial' ? 'Enter a target from 55 to 660 lb.' : 'Enter a target from 25 to 300 kg.'
    } else if ((answers.goal === 'lose' && targetKg >= currentKg) || (['build', 'gain'].includes(answers.goal) && targetKg <= currentKg)) {
      errors.targetWeight = answers.goal === 'lose' ? 'For this goal, the target should be below your current weight.' : 'For this goal, the target should be above your current weight.'
    } else if (Math.abs(targetKg - currentKg) / currentKg > 0.2) {
      errors.targetWeight = 'That is a large change from your current weight. Choose a nearer milestone and review your goals with a qualified professional.'
    }
    if (answers.targetDate && answers.targetDate <= new Date().toISOString().slice(0, 10)) errors.targetDate = 'Choose a future date or leave it blank.'
  }
  if (step === 4 && !answers.activity) errors.activity = 'Choose the activity level that best describes a typical week.'
  if (step === 5) {
    if (!answers.diet) errors.diet = 'Choose a preference, including “No specific preference”.'
    if (answers.diet === 'other' && !answers.dietOther.trim()) errors.dietOther = 'Add a short description or choose another option.'
  }
  if (step === 6) {
    if (!answers.experience) errors.experience = 'Choose your current training experience.'
    if (!answers.trainingLocation) errors.trainingLocation = 'Choose where you usually train.'
    const days = Number(answers.trainingDays)
    if (!Number.isInteger(days) || days < 1 || days > 7) errors.trainingDays = 'Choose 1–7 days per week.'
    if (answers.workoutMinutes && (!Number.isInteger(Number(answers.workoutMinutes)) || Number(answers.workoutMinutes) < 10 || Number(answers.workoutMinutes) > 180)) errors.workoutMinutes = 'Enter a duration from 10 to 180 minutes.'
  }
  return errors
}

const ACTIVITY_FACTORS: Record<Exclude<OnboardingAnswers['activity'], ''>, number> = {
  low: 1.2, light: 1.375, moderate: 1.55, high: 1.725,
}

export function calculateTargets(answers: OnboardingAnswers) {
  const age = Number(answers.age)
  const height = heightInCm(answers)
  const weight = weightInKg(answers.weight, answers.units)
  const activityFactor = ACTIVITY_FACTORS[answers.activity]
  if (age < 18 || age > 100 || height < 100 || height > 240 || weight < 25 || weight > 300
    || !Number.isFinite(age) || !Number.isFinite(height) || !Number.isFinite(weight) || !activityFactor) return null
  const sexAdjustment = answers.sex === 'male' ? 5 : answers.sex === 'female' ? -161 : -78
  const bmr = 10 * weight + 6.25 * height - 5 * age + sexAdjustment
  const goalAdjustment = answers.goal === 'lose' ? -300 : ['build', 'gain'].includes(answers.goal) ? 150 : 0
  const calories = Math.max(1200, Math.min(5000, Math.round(bmr * activityFactor + goalAdjustment)))
  const proteinMultiplier = answers.goal === 'lose' || answers.goal === 'build' ? 1.8 : 1.6
  const protein = Math.round(weight * proteinMultiplier)
  return {
    calories,
    protein,
    carbs: Math.round((calories * 0.45) / 4),
    fat: Math.round((calories * 0.25) / 9),
    fiber: 28,
  }
}

export function buildDraftPatch(userId: string, answers: OnboardingAnswers, currentStep: number, profileExists: boolean) {
  return {
    id: userId,
    onboarding_data: { schemaVersion: 1, currentStep, answers },
    ...(!profileExists ? { gender: null } : {}),
  }
}

export function buildCompletedProfilePatch(
  userId: string,
  answers: OnboardingAnswers,
  profileExists: boolean,
  completedAt: string,
) {
  const targets = calculateTargets(answers)
  if (!targets) throw new Error('Cannot calculate targets from an incomplete profile')
  const goal = answers.goal === 'lose' ? 'lose'
    : answers.goal === 'build' || answers.goal === 'gain' ? 'gain'
      : 'maintain'
  const patch: Record<string, unknown> = {
    id: userId,
    age: Number(answers.age),
    height: heightInCm(answers),
    current_weight_kg: weightInKg(answers.weight, answers.units),
    goal,
    cal_target: targets.calories,
    protein_target: targets.protein,
    carb_target: targets.carbs,
    fat_target: targets.fat,
    fiber_target: targets.fiber,
    onboarding_data: { schemaVersion: 1, currentStep: LAST_ONBOARDING_STEP, answers },
    onboarding_completed_at: completedAt,
    ...(!profileExists && answers.sex !== 'male' && answers.sex !== 'female' ? { gender: null } : {}),
  }
  if (answers.name.trim()) patch.name = answers.name.trim()
  if (answers.sex === 'male' || answers.sex === 'female') patch.gender = answers.sex
  if (answers.targetWeight && ['lose', 'build', 'gain'].includes(answers.goal)) {
    patch.weight_goal = weightInKg(answers.targetWeight, answers.units)
  } else if (!profileExists) {
    patch.weight_goal = null
  }
  return patch
}
