import { getPlanConfig, type PlanConfig, type PlanId } from './plans'

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

export const ENTITLEMENT_DEFINITIONS: Record<EntitlementId, {
  label: string
  description: string
  availability: 'available' | 'coming_soon'
}> = {
  food_tracking: { label: 'Food tracking', description: 'Log meals and monitor daily nutrition.', availability: 'available' },
  basic_insights: { label: 'Basic nutrition insights', description: 'See practical summaries from your logs.', availability: 'available' },
  ai_coach: { label: 'AI Coach', description: 'Get guidance within your plan allowance.', availability: 'available' },
  advanced_ai_coach: { label: 'Advanced AI Coach', description: 'Deeper personalized health intelligence.', availability: 'coming_soon' },
  meal_planning: { label: 'Meal planning', description: 'Plan meals around your nutrition targets.', availability: 'available' },
  advanced_meal_planning: { label: 'Advanced meal planning', description: 'More personalized planning workflows.', availability: 'coming_soon' },
  workout_planning: { label: 'Workout planning', description: 'Build guided training plans.', availability: 'coming_soon' },
  advanced_progress: { label: 'Advanced progress', description: 'Explore deeper progress analytics.', availability: 'coming_soon' },
  supplements: { label: 'Supplements', description: 'Track your supplement routine.', availability: 'available' },
  health_insights: { label: 'Health intelligence', description: 'Connect more signals for richer insights.', availability: 'coming_soon' },
}

const BASE_ENTITLEMENTS: Entitlements = {
  food_tracking: true,
  basic_insights: true,
  ai_coach: { enabled: true },
  advanced_ai_coach: false,
  meal_planning: true,
  advanced_meal_planning: false,
  workout_planning: false,
  advanced_progress: false,
  supplements: true,
  health_insights: false,
}

const BASIC_ENTITLEMENTS: Entitlements = {
  ...BASE_ENTITLEMENTS,
}

const STANDARD_ENTITLEMENTS: Entitlements = {
  ...BASE_ENTITLEMENTS,
  advanced_meal_planning: true,
  advanced_progress: true,
}

const PREMIUM_ENTITLEMENTS: Entitlements = {
  ...BASE_ENTITLEMENTS,
  advanced_meal_planning: true,
  advanced_progress: true,
}

const PRO_ENTITLEMENTS: Entitlements = {
  ...PREMIUM_ENTITLEMENTS,
  advanced_ai_coach: true,
  workout_planning: true,
  health_insights: true,
}

export function getPlanEntitlements(planId: PlanId): Entitlements {
  if (planId === 'free') return { ...BASE_ENTITLEMENTS }
  if (planId === 'basic') return { ...BASIC_ENTITLEMENTS }
  if (planId === 'standard') return { ...STANDARD_ENTITLEMENTS }
  if (planId === 'premium') return { ...PREMIUM_ENTITLEMENTS }
  return { ...PRO_ENTITLEMENTS }
}

export function getUserEntitlements(subscription?: { plan_id?: string | null; status?: string | null } | null): Entitlements {
  const plan = subscription?.status === 'canceled' || subscription?.status === 'expired'
    ? getPlanConfig('free')
    : getPlanConfig(subscription?.plan_id)
  const entitlements = getPlanEntitlements(plan.id)

  return {
    ...entitlements,
    ai_coach: {
      enabled: true,
      limit: plan.aiRequestsPerPeriod,
    },
  }
}

export function canUseFeature(entitlements: Entitlements, feature: EntitlementId): boolean {
  const value = entitlements[feature]
  return typeof value === 'boolean' ? value : value.enabled
}

export function getAIRequestLimit(entitlements: Entitlements): number | null {
  const value = entitlements.ai_coach
  return typeof value === 'boolean' ? (value ? null : 0) : value.limit ?? null
}

export function planFromSubscription(subscription?: { plan_id?: string | null; status?: string | null } | null): PlanConfig {
  return subscription?.status === 'canceled' || subscription?.status === 'expired'
    ? getPlanConfig('free')
    : getPlanConfig(subscription?.plan_id)
}
