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

export interface PlanPrice {
  mrp: number
  discountAmount: number
  offerPrice: number
  displayDiscountPercentage: number
  currency: 'INR'
}

export interface PlanConfig {
  id: PlanId
  displayName: string
  description: string
  active: boolean
  billingInterval: BillingInterval
  prices: Record<BillingPeriod, PlanPrice>
  trialEligible: boolean
  providerProductIds: {
    revenuecat?: string
    stripe?: string
  }
  entitlements: Entitlements
}

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
  advanced_progress: { label: 'Advanced progress', description: 'Explore deeper progress analytics.', availability: 'available' },
  supplements: { label: 'Supplements', description: 'Track your supplement routine.', availability: 'available' },
  health_insights: { label: 'Health intelligence', description: 'Connect more signals for richer insights.', availability: 'coming_soon' },
}

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

function price(mrp: number, discountAmount: number, offerPrice: number, displayDiscountPercentage: number): PlanPrice {
  return { mrp, discountAmount, offerPrice, displayDiscountPercentage, currency: 'INR' }
}

const FREE_PRICE = price(0, 0, 0, 0)

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    displayName: 'Free',
    description: 'Core nutrition, fitness, and tracking features.',
    active: true,
    billingInterval: null,
    prices: { monthly: FREE_PRICE, yearly: FREE_PRICE },
    trialEligible: false,
    providerProductIds: {},
    entitlements: entitlements(10),
  },
  basic: {
    id: 'basic',
    displayName: 'Basic',
    description: 'Essential features for getting started with KAYVEN.',
    active: true,
    billingInterval: 'month',
    prices: {
      monthly: price(499, 200, 299, 40),
      yearly: price(3999, 1700, 2299, 43),
    },
    trialEligible: false,
    providerProductIds: {},
    entitlements: entitlements(100),
  },
  standard: {
    id: 'standard',
    displayName: 'Standard',
    description: 'Enhanced features for regular users.',
    active: true,
    billingInterval: 'month',
    prices: {
      monthly: price(799, 300, 499, 38),
      yearly: price(6499, 2600, 3899, 40),
    },
    trialEligible: false,
    providerProductIds: {},
    entitlements: entitlements(100, {
      advanced_meal_planning: true,
      advanced_progress: true,
    }),
  },
  premium: {
    id: 'premium',
    displayName: 'Premium',
    description: 'Expanded AI Coach and advanced health intelligence. (Legacy)',
    active: false,
    billingInterval: 'month',
    prices: {
      monthly: price(799, 200, 599, 25),
      yearly: price(7990, 2000, 5990, 25),
    },
    trialEligible: false,
    providerProductIds: {},
    entitlements: entitlements(100, {
      advanced_meal_planning: true,
      advanced_progress: true,
    }),
  },
  pro: {
    id: 'pro',
    displayName: 'Pro AI',
    description: 'The complete KAYVEN intelligence experience.',
    active: false,
    billingInterval: 'month',
    prices: {
      monthly: price(1999, 600, 1399, 30),
      yearly: price(15499, 4600, 10899, 30),
    },
    trialEligible: false,
    providerProductIds: {},
    entitlements: entitlements(300, {
      advanced_ai_coach: true,
      advanced_meal_planning: true,
      workout_planning: true,
      advanced_progress: true,
      health_insights: true,
    }),
  },
}

export const DEFAULT_PLAN_ID: PlanId = 'free'

export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  return PLANS[planId as PlanId] || PLANS[DEFAULT_PLAN_ID]
}
