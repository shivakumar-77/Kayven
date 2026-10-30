export type PlanId = 'free' | 'basic' | 'standard' | 'premium' | 'pro'
export type BillingInterval = 'month' | 'year' | null
export type BillingPeriod = 'monthly' | 'yearly'

export type EntitlementId =
  | 'food_tracking'
  | 'basic_insights'
  | 'ai_coach'
  | 'advanced_ai_coach'
  | 'meal_planning'
  | 'advanced_meal_planning'
  | 'workout_planning'
  | 'advanced_progress'
  | 'supplements'
  | 'health_insights'

export type EntitlementValue = boolean | { enabled: boolean; limit?: number | null }
export type Entitlements = Record<EntitlementId, EntitlementValue>

export interface PlanConfig {
  id: PlanId
  displayName: string
  description: string
  active: boolean
  billingInterval: BillingInterval
  trialEligible: boolean
  entitlements: Entitlements
}

export const PAID_PLAN_IDS = ['basic', 'standard', 'pro'] as const satisfies readonly PlanId[]
export type PaidPlanId = typeof PAID_PLAN_IDS[number]

export const ENTITLEMENT_DEFINITIONS: Record<EntitlementId, {
  label: string
  description: string
  availability: 'available' | 'coming_soon'
}> = {
  food_tracking: { label: 'Food and nutrition tracking', description: 'Log meals and monitor calories and macros.', availability: 'available' },
  basic_insights: { label: 'Nutrition summaries', description: 'Review practical summaries from your logs.', availability: 'available' },
  ai_coach: { label: 'AI Coach', description: 'Monthly AI request allowance shown for each plan.', availability: 'available' },
  advanced_ai_coach: { label: 'Advanced AI Coach', description: 'Deeper personalized health intelligence.', availability: 'coming_soon' },
  meal_planning: { label: 'Meal planning', description: 'Create a meal plan based on your goals.', availability: 'available' },
  advanced_meal_planning: { label: 'Advanced meal planning', description: 'Additional personalized planning workflows.', availability: 'coming_soon' },
  workout_planning: { label: 'Workout planning', description: 'Build guided training plans.', availability: 'coming_soon' },
  advanced_progress: { label: 'AI weekly progress insights', description: 'AI-generated insights based on your weekly logs.', availability: 'available' },
  supplements: { label: 'Supplement tracking', description: 'Track your supplement routine.', availability: 'available' },
  health_insights: { label: 'Connected health insights', description: 'Connect more signals for richer insights.', availability: 'coming_soon' },
}

export const PLAN_COMPARISON_FEATURES: Array<{
  id: string
  label: string
  entitlement?: EntitlementId
  availableForAllPlans?: boolean
}> = [
  { id: 'food_tracking', label: 'Food, calories and macros', entitlement: 'food_tracking' },
  { id: 'hydration_tracking', label: 'Hydration tracking', availableForAllPlans: true },
  { id: 'workout_tracking', label: 'Workout logging', availableForAllPlans: true },
  { id: 'activity_tracking', label: 'Activity and step tracking', availableForAllPlans: true },
  { id: 'sleep_tracking', label: 'Sleep tracking', availableForAllPlans: true },
  { id: 'progress_history', label: 'Progress and weight history', availableForAllPlans: true },
  { id: 'nutrition_summaries', label: 'Nutrition summaries', entitlement: 'basic_insights' },
  { id: 'meal_planning', label: 'Meal planning', entitlement: 'meal_planning' },
  { id: 'ai_progress', label: 'AI weekly progress insights', entitlement: 'advanced_progress' },
  { id: 'supplements', label: 'Supplement tracking', entitlement: 'supplements' },
]

const BASE_ENTITLEMENTS: Omit<Entitlements, 'ai_coach'> = {
  food_tracking: true,
  basic_insights: true,
  advanced_ai_coach: false,
  meal_planning: true,
  advanced_meal_planning: false,
  workout_planning: false,
  advanced_progress: false,
  supplements: true,
  health_insights: false,
}

function entitlements(aiLimit: number, overrides: Partial<Omit<Entitlements, 'ai_coach'>> = {}): Entitlements {
  return {
    ...BASE_ENTITLEMENTS,
    ...overrides,
    ai_coach: { enabled: true, limit: aiLimit },
  }
}

const FREE_ENTITLEMENTS = entitlements(10)
const BASIC_ENTITLEMENTS = entitlements(100)
const STANDARD_ENTITLEMENTS = entitlements(100, { advanced_progress: true })
const PRO_ENTITLEMENTS = entitlements(300, { advanced_progress: true })

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    displayName: 'Free',
    description: 'Core health and nutrition tracking.',
    active: true,
    billingInterval: null,
    trialEligible: false,
    entitlements: FREE_ENTITLEMENTS,
  },
  basic: {
    id: 'basic',
    displayName: 'Basic',
    description: 'Everyday health tracking with an expanded AI Coach allowance.',
    active: true,
    billingInterval: 'month',
    trialEligible: false,
    entitlements: BASIC_ENTITLEMENTS,
  },
  standard: {
    id: 'standard',
    displayName: 'Standard',
    description: 'Everyday tracking plus AI weekly progress insights.',
    active: true,
    billingInterval: 'month',
    trialEligible: false,
    entitlements: STANDARD_ENTITLEMENTS,
  },
  premium: {
    id: 'premium',
    displayName: 'Premium (legacy)',
    description: 'Existing legacy subscription.',
    active: false,
    billingInterval: 'month',
    trialEligible: false,
    entitlements: STANDARD_ENTITLEMENTS,
  },
  pro: {
    id: 'pro',
    displayName: 'Pro AI',
    description: 'The highest configured AI Coach allowance plus AI weekly progress insights.',
    active: true,
    billingInterval: 'month',
    trialEligible: false,
    entitlements: PRO_ENTITLEMENTS,
  },
}

export const DEFAULT_PLAN_ID: PlanId = 'free'

export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  return PLANS[planId as PlanId] || PLANS[DEFAULT_PLAN_ID]
}
