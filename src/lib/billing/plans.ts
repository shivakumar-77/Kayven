export type PlanId = 'free' | 'basic' | 'standard' | 'premium' | 'pro'
export type BillingInterval = 'month' | 'year' | null

export interface PlanConfig {
  id: PlanId
  displayName: string
  description: string
  active: boolean
  billingInterval: BillingInterval
  providerProductIds: {
    revenuecat?: string
    stripe?: string
  }
  aiRequestsPerPeriod: number | null
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    displayName: 'Free',
    description: 'Core nutrition, fitness, and tracking features.',
    active: true,
    billingInterval: null,
    providerProductIds: {},
    aiRequestsPerPeriod: 10,
  },
  basic: {
    id: 'basic',
    displayName: 'Basic',
    description: 'Essential features for getting started with KAYVEN.',
    active: true,
    billingInterval: 'month',
    providerProductIds: {},
    aiRequestsPerPeriod: 100,
  },
  standard: {
    id: 'standard',
    displayName: 'Standard',
    description: 'Enhanced features for regular users.',
    active: true,
    billingInterval: 'month',
    providerProductIds: {},
    aiRequestsPerPeriod: 100,
  },
  premium: {
    id: 'premium',
    displayName: 'Premium',
    description: 'Expanded AI Coach and advanced health intelligence. (Legacy)',
    active: false,
    billingInterval: 'month',
    providerProductIds: {},
    aiRequestsPerPeriod: 100,
  },
  pro: {
    id: 'pro',
    displayName: 'Pro AI',
    description: 'The complete KAYVEN intelligence experience.',
    active: false,
    billingInterval: 'month',
    providerProductIds: {},
    aiRequestsPerPeriod: 300,
  },
}

export const DEFAULT_PLAN_ID: PlanId = 'free'

export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  return PLANS[planId as PlanId] || PLANS[DEFAULT_PLAN_ID]
}
