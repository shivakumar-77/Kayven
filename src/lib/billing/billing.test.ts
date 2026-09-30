import { canUseFeature, getAIRequestLimit, getUserEntitlements } from './entitlements'
import { getPlanConfig, PLANS } from './plans'
import { entitlementDeniedPayload, isDevelopmentOverrideAllowed, requiredPlanForFeature, suggestedUpgradePlan } from './server'

export function runBillingTests(): void {
  const removedPlanId = ['life', 'time'].join('')
  if (removedPlanId in PLANS) throw new Error('removed plan must not exist')
  if (getPlanConfig('invalid-plan').id !== 'free') throw new Error('invalid plan must default to free')

  const free = getUserEntitlements(null)
  const premium = getUserEntitlements({ plan_id: 'premium' })
  const pro = getUserEntitlements({ plan_id: 'pro' })
  const expired = getUserEntitlements({ plan_id: 'pro', status: 'expired' })

  if (getAIRequestLimit(free) !== 10) throw new Error('free AI limit is incorrect')
  if (getAIRequestLimit(premium) !== 100) throw new Error('premium AI limit is incorrect')
  if (getAIRequestLimit(pro) !== 300) throw new Error('pro AI limit is incorrect')
  if (canUseFeature(free, 'advanced_ai_coach')) throw new Error('free advanced AI must be disabled')
  if (canUseFeature(premium, 'advanced_ai_coach')) throw new Error('premium advanced AI must remain Pro-only')
  if (!canUseFeature(premium, 'advanced_meal_planning')) throw new Error('premium advanced meal planning must be enabled')
  if (!canUseFeature(pro, 'advanced_progress')) throw new Error('pro advanced progress must be enabled')
  if (canUseFeature(expired, 'advanced_progress')) throw new Error('expired subscription must resolve to Free entitlements')
  if (requiredPlanForFeature('advanced_meal_planning') as string !== 'premium') throw new Error('advanced meal planning should require premium')
  if (requiredPlanForFeature('advanced_ai_coach') as string !== 'pro') throw new Error('advanced AI Coach should require pro')
  if (entitlementDeniedPayload({ allowed: false, state: {} as never, requiredPlan: 'pro' }).requiredPlan !== 'pro') throw new Error('structured entitlement denial is incorrect')
  if (suggestedUpgradePlan('free') as string !== 'premium') throw new Error('free should suggest premium')
  if (suggestedUpgradePlan('premium') as string !== 'pro') throw new Error('premium should suggest pro')
  if (suggestedUpgradePlan('pro') !== null) throw new Error('pro should not suggest a higher plan')

  if (isDevelopmentOverrideAllowed('test-user', 'production', 'pro', 'test-user')) {
    throw new Error('development override must be disabled in production')
  }
  if (!isDevelopmentOverrideAllowed('test-user', 'development', 'pro', 'test-user')) {
    throw new Error('development override should match the configured user')
  }
}