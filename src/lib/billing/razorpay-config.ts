import { PLANS, type BillingPeriod, type PlanId, type PlanPrice } from './plans'
export type { BillingPeriod } from './plans'

export interface RazorpayPlanConfig extends PlanPrice {
  planId: PlanId
  displayName: string
  billingPeriod: BillingPeriod
}

export function validateRazorpayPlanConfig(config: RazorpayPlanConfig): boolean {
  const calculatedOfferPrice = config.mrp - config.discountAmount
  const calculatedDiscountPercentage = config.mrp === 0
    ? 0
    : Math.round((config.discountAmount / config.mrp) * 100)

  return config.offerPrice === calculatedOfferPrice
    && config.displayDiscountPercentage === calculatedDiscountPercentage
}

const periods: BillingPeriod[] = ['monthly', 'yearly']
const planIds = Object.keys(PLANS) as PlanId[]
const entries = planIds.flatMap(planId => periods.map(period => {
  const plan = PLANS[planId]
  const key = `${planId}-${period}` as const
  return [key, {
    ...plan.prices[period],
    planId,
    displayName: plan.displayName,
    billingPeriod: period,
  }] as const
}))

export const RAZORPAY_PLANS = Object.fromEntries(entries) as Record<
  `${PlanId}-${BillingPeriod}`,
  RazorpayPlanConfig
>

export function getRazorpayPlanConfig(planId: PlanId, billingPeriod: BillingPeriod): RazorpayPlanConfig | undefined {
  return RAZORPAY_PLANS[`${planId}-${billingPeriod}` as `${PlanId}-${BillingPeriod}`]
}

export function validateAllPricingConfigs(): boolean {
  return Object.values(RAZORPAY_PLANS).every(validateRazorpayPlanConfig)
}

if (!validateAllPricingConfigs()) {
  throw new Error('Invalid Razorpay pricing configuration detected')
}
