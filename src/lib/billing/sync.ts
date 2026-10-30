import { toSubscriptionRecord, type BillingProvider } from './provider'
import type { PlanId } from './plans'
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin'

export async function syncSubscriptionState(
  userId: string,
  provider: BillingProvider,
  customerId: string,
): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  if (!supabase) throw new Error('Subscription storage is not configured')

  const state = await provider.getCustomerSubscriptionState(customerId)
  if (!state) {
    const { error } = await supabase
      .from('subscriptions')
      .update({ plan_id: 'free', billing_period: null, status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider.name)
    if (error) {
      console.error('Error expiring subscription:', error)
      throw new Error('Unable to update subscription state')
    }
    return true
  }

  if (!(await provider.verifyEntitlements(state))) return false

  const planId = provider.mapProviderProductToPlan(state.productId || '')
  if (!planId) return false

  const subscription = toSubscriptionRecord(userId, state, planId)
  const { data: existing, error: lookupError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider.name)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    console.error('Error locating subscription to update:', lookupError)
    throw new Error('Unable to update subscription state')
  }

  const write = existing?.id
    ? await supabase.from('subscriptions').update(subscription).eq('id', existing.id)
    : await supabase.from('subscriptions').insert(subscription)
  if (write.error) {
    console.error('Error saving subscription state:', write.error)
    throw new Error('Unable to update subscription state')
  }

  return true
}
