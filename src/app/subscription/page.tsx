'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import AIUsageMeter from '@/components/AIUsageMeter'
import RazorpayCheckout from '@/components/RazorpayCheckout'
import UpgradePrompt from '@/components/UpgradePrompt'
import { refreshSubscription, useSubscription } from '@/lib/billing/client'
import { ENTITLEMENT_DEFINITIONS, canUseFeature, getPlanEntitlements } from '@/lib/billing/entitlements'
import { PLANS, type PlanId } from '@/lib/billing/plans'
import { getRazorpayPlanConfig, type RazorpayPlanConfig, type BillingPeriod } from '@/lib/billing/razorpay-config'

const PLAN_ORDER: PlanId[] = ['free', 'basic', 'standard', 'pro']

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SubscriptionPage() {
  const router = useRouter()
  const { state, loading, error } = useSubscription()
  const [actionState, setActionState] = useState<'idle' | 'purchasing' | 'success' | 'error' | 'syncing'>('idle')
  const [actionMessage, setActionMessage] = useState('')

  if (loading) {
    return <main style={{ minHeight: '100dvh', background: 'var(--surface)' }}><PageHeader title="Plans" href="/dashboard" /><div style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: 'var(--muted)' }}>Loading your plan...</div><BottomNav /></main>
  }

  if (error || !state) {
    return <main style={{ minHeight: '100dvh', background: 'var(--surface)' }}><PageHeader title="Plans" href="/dashboard" /><div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}><UpgradePrompt title="Plans are unavailable" message="We could not load your subscription state. Please try again later." /></div><BottomNav /></main>
  }

  const currentPlan = PLANS[state.currentPlan] || PLANS.free
  const periodEnd = formatDate(state.currentPeriodEnd)
  const statusLabel = state.cancelAtPeriodEnd && state.subscriptionStatus === 'active'
    ? 'Canceling at period end'
    : state.subscriptionStatus === 'trialing'
      ? 'Trial'
      : state.subscriptionStatus === 'past_due'
        ? 'Billing issue'
        : state.subscriptionStatus === 'expired'
          ? 'Expired'
          : state.subscriptionStatus === 'free' ? 'Active' : state.subscriptionStatus

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--surface)', paddingBottom: 112 }}>
      <PageHeader title="KAYVEN Plans" subtitle="Your access, clearly explained" href="/dashboard" />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        {state.statusUnavailable && <p role="status" style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>Unable to refresh subscription status. Showing available plans; your access is verified when you use protected features.</p>}
        <section style={{ padding: 20, borderRadius: 20, background: 'linear-gradient(135deg, var(--primary-bg), var(--card))', border: '1px solid color-mix(in srgb, var(--primary) 18%, var(--border))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
            <div><div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Current plan</div><h1 style={{ marginTop: 6, fontSize: 28 }}>{currentPlan.displayName}</h1><p style={{ marginTop: 6, color: 'var(--muted)', lineHeight: 1.5 }}>{currentPlan.description}</p></div>
            <span style={{ padding: '7px 10px', borderRadius: 99, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 700 }}>{statusLabel}</span>
          </div>
          {periodEnd && <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: 13 }}>{state.cancelAtPeriodEnd ? `Access continues until ${periodEnd}.` : `Current period ends ${periodEnd}.`}</p>}
          <button type="button" onClick={() => router.push('/subscription/manage')} style={{ marginTop: 16, padding: '10px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontWeight: 700 }}>Manage subscription</button>
        </section>

        <div style={{ marginTop: 16 }}><AIUsageMeter /></div>

        <section style={{ marginTop: 16, padding: 18, borderRadius: 18, background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 18 }}>Razorpay test checkout</h2>
          <p style={{ marginTop: 6, marginBottom: 14, color: 'var(--muted)', fontSize: 13 }}>Complete a ₹1 test payment securely with Razorpay.</p>
          <RazorpayCheckout amount={100} description="KAYVEN test payment" label="Pay ₹1 with Razorpay" />
        </section>

        <section style={{ marginTop: 26 }}>
          <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 20 }}>Choose your level</h2><p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Select a plan below to upgrade or downgrade your subscription.</p></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12 }}>
            {PLAN_ORDER.map(planId => {
              const plan = PLANS[planId]
              const entitlements = planId === state.currentPlan ? state.entitlements : getPlanEntitlements(planId)
              const razorpayConfig = getRazorpayPlanConfig(planId as PlanId, 'monthly' as BillingPeriod)
              const priceDisplay = razorpayConfig ? `₹${razorpayConfig.offerPrice.toLocaleString()}/month` : 'Coming soon'
              const originalPrice = razorpayConfig ? razorpayConfig.mrp : null
              const discountPercent = razorpayConfig && originalPrice ? Math.round(((originalPrice - razorpayConfig.offerPrice) / originalPrice) * 100) : 0
              
              return <article key={plan.id} style={{ position: 'relative', padding: 18, borderRadius: 18, background: 'var(--card)', border: plan.id === state.currentPlan ? '2px solid var(--primary)' : '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                {plan.id === state.currentPlan && <span style={{ position: 'absolute', right: 14, top: 14, color: 'var(--primary)', fontSize: 11, fontWeight: 800 }}>CURRENT</span>}
                <h3 style={{ fontSize: 18 }}>{plan.displayName}</h3><p style={{ marginTop: 6, minHeight: 42, color: 'var(--muted)', fontSize: 13, lineHeight: 1.4 }}>{plan.description}</p>
                <div style={{ margin: '14px 0', color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>{plan.aiRequestsPerPeriod === null ? 'AI usage: no configured limit' : `${plan.aiRequestsPerPeriod} AI requests / month`}</div>
                <ul style={{ display: 'grid', gap: 9, padding: 0, listStyle: 'none' }}>
                  {Object.entries(ENTITLEMENT_DEFINITIONS).map(([feature, definition]) => {
                    const enabled = canUseFeature(entitlements, feature as keyof typeof ENTITLEMENT_DEFINITIONS)
                    if (!enabled && definition.availability === 'coming_soon') return null
                    return <li key={feature} style={{ display: 'flex', gap: 8, alignItems: 'start', fontSize: 12, color: enabled ? 'var(--text-2)' : 'var(--muted)' }}><span aria-hidden="true" style={{ color: enabled ? 'var(--green)' : 'var(--muted)' }}>{enabled ? '✓' : '○'}</span><span>{definition.label}{definition.availability === 'coming_soon' ? ' · Coming soon' : ''}</span></li>
                  })}
                </ul>
                {plan.id !== state.currentPlan && razorpayConfig && (() => {
                  const purchasing = actionState === 'purchasing'
                  return <button type="button" onClick={async () => {
                    if (actionState === 'purchasing' || actionState === 'syncing') return
                    setActionState('purchasing')
                    setActionMessage('Payment initiated. Please complete the payment...')
                    try {
                      // Create Razorpay order for subscription
                      const response = await fetch('/api/create-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          plan_id: planId,
                          period: 'monthly'
                        })
                      })
                      
                      if (!response.ok) {
                        throw new Error('Failed to create payment order')
                      }
                      
                      const orderData = await response.json()
                      
                      // Open Razorpay checkout
                      await new Promise<void>((resolve, reject) => {
                        // @ts-ignore - Razorpay is available globally
                        const razorpay = new (window as any).Razorpay({
                          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                          amount: razorpayConfig.offerPrice * 100, // Amount in paise
                          currency: 'INR',
                          name: 'KAYVEN',
                          description: `${plan.displayName} subscription`,
                          image: '/logo.svg',
                          order_id: orderData.id,
                          handler: async function(response: any) {
                            try {
                              // Verify payment
                              const verifyResponse = await fetch('/api/verify-payment', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  razorpay_payment_id: response.razorpay_payment_id,
                                  razorpay_order_id: response.razorpay_order_id,
                                  razorpay_signature: response.razorpay_signature,
                                  plan_id: planId,
                                  period: 'monthly'
                                })
                              })
                              
                              if (!verifyResponse.ok) {
                                throw new Error('Payment verification failed')
                              }
                              
                              const verifyData = await verifyResponse.json()
                              
                              if (verifyData.success) {
                                // Refresh subscription status
                                const refreshed = await refreshSubscription()
                                if (refreshed.currentPlan === plan.id) {
                                  setActionState('success')
                                  setActionMessage(`${plan.displayName} access is active.`)
                                } else {
                                  setActionState('syncing')
                                  setActionMessage("Payment received. We're waiting for subscription sync.")
                                }
                              } else {
                                throw new Error('Payment verification failed')
                              }
                              resolve()
                            } catch (error) {
                              reject(error)
                            }
                          },
                          prefill: {
                            name: '',
                            email: '',
                            contact: ''
                          },
                          theme: {
                            color: '#FF6600'
                          }
                        })
                        
                        razorpay.open()
                      })
                    } catch (error) {
                      console.error('Payment error:', error)
                      setActionState('error')
                      setActionMessage('The payment was not completed. Please try again.')
                    }
                  }} disabled={purchasing || actionState === 'syncing'} title={`Upgrade to ${plan.displayName}`} style={{ width: '100%', marginTop: 18, padding: '11px 14px', borderRadius: 12, border: '1px solid var(--border)', background: purchasing ? 'var(--primary-bg)' : 'var(--primary)', color: purchasing ? '#fff' : '#fff', fontWeight: 700, position: 'relative' }}>
                    {purchasing && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l4 4"/><path d="M12 16l-4-4 4-4"/></svg></span>} Processing...
                    {!purchasing && (
                      <>
                        Upgrade to {plan.displayName}
                        {originalPrice && discountPercent > 0 && (
                          <>
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--green)' }}>-{discountPercent}%</span>
                            <span style={{ marginLeft: 4, textDecoration: 'line-through', fontSize: 11, color: 'var(--muted)' }}>₹{originalPrice.toLocaleString()}</span>
                          </>
                        )}
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>{priceDisplay}</span>
                      </>
                    )}
                  </button>
                })()}
              </article>
            })}
          </div>
        </section>
      </div>
      <BottomNav />
    </main>
  )
}
