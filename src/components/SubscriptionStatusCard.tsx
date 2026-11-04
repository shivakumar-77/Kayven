'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ClientSubscriptionState } from '@/lib/billing/client'
import { PLANS } from '@/lib/billing/plans'
import UpgradePrompt from './UpgradePrompt'

interface SubscriptionStatusCardProps {
  state: ClientSubscriptionState
  managementUrl?: string | null
  onRefresh?: () => Promise<void>
  refreshing?: boolean
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SubscriptionStatusCard({ state, managementUrl, onRefresh, refreshing }: SubscriptionStatusCardProps) {
  const [confirming, setConfirming] = useState(false)
  const currentPeriodEnd = formatDate(state.currentPeriodEnd)
  const periodEndIsFuture = state.currentPeriodEnd !== null && Date.parse(state.currentPeriodEnd) > Date.now()
  const isUnavailable = state.statusUnavailable === true
  const isFree = state.currentPlan === 'free' && !isUnavailable
  const isPaid = !isFree && !isUnavailable
  const isCanceling = state.cancelAtPeriodEnd
    && periodEndIsFuture
    && (state.subscriptionStatus === 'active' || state.subscriptionStatus === 'canceled')
  const statusLabel = isUnavailable
    ? 'Unavailable'
    : isCanceling
    ? 'Canceling at period end'
    : state.subscriptionStatus === 'trialing'
      ? 'Trialing'
      : state.subscriptionStatus === 'past_due'
        ? 'Billing issue'
        : state.subscriptionStatus === 'canceled'
          ? 'Canceled'
        : state.subscriptionStatus === 'expired'
          ? 'Expired'
          : isFree ? 'Free' : 'Active'
  const planName = isUnavailable ? 'Plan status unavailable' : PLANS[state.currentPlan]?.displayName || state.currentPlan

  function openManagement() {
    if (!managementUrl) return
    window.open(managementUrl, '_blank', 'noopener,noreferrer')
    setConfirming(false)
  }

  return (
    <section aria-labelledby="subscription-status-title" style={{ padding: 20, borderRadius: 20, background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Current subscription</div>
          <h2 id="subscription-status-title" style={{ marginTop: 6, fontSize: 24 }}>{planName}</h2>
        </div>
        <span style={{ padding: '7px 10px', borderRadius: 99, background: isCanceling ? 'var(--orange-bg)' : 'var(--card2)', color: isCanceling ? 'var(--orange)' : 'var(--text-2)', fontSize: 12, fontWeight: 700 }}>{statusLabel}</span>
      </div>

      {isUnavailable && <p role="alert" style={{ marginTop: 14, color: 'var(--orange)', lineHeight: 1.5 }}>Kayven could not verify your subscription. Plan access and billing details are unavailable until the status can be refreshed.</p>}
      {isFree && <p style={{ marginTop: 14, color: 'var(--muted)', lineHeight: 1.5 }}>You’re currently on the Free plan. <Link href="/subscription" style={{ color: 'var(--primary)', fontWeight: 700 }}>View details</Link></p>}
      {isPaid && isCanceling && currentPeriodEnd && <p style={{ marginTop: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>Your subscription is scheduled to end. Access remains active until {currentPeriodEnd}, then your account will move to the Free plan.</p>}
      {isPaid && !isCanceling && state.subscriptionStatus === 'past_due' && <p role="alert" style={{ marginTop: 14, color: 'var(--orange)', lineHeight: 1.5 }}>There is an issue with your subscription payment. Some features may become unavailable if it is not resolved.</p>}
      {!isUnavailable && state.subscriptionStatus === 'expired' && <p style={{ marginTop: 14, color: 'var(--muted)', lineHeight: 1.5 }}>Your subscription has ended. You are currently using the Free plan.</p>}
      {isPaid && state.billingPeriod && <p style={{ marginTop: 10, color: 'var(--muted)', fontSize: 13 }}>Billing frequency: {state.billingPeriod}.</p>}
      {isPaid && !isCanceling && state.subscriptionStatus !== 'expired' && currentPeriodEnd && <p style={{ marginTop: 14, color: 'var(--muted)' }}>{state.subscriptionStatus === 'trialing' ? 'Trial ends' : state.subscriptionStatus === 'past_due' ? 'Current period ends' : 'Renews on'} {currentPeriodEnd}.</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        {onRefresh && <button type="button" onClick={() => void onRefresh()} disabled={refreshing} aria-busy={refreshing} style={{ padding: '10px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text-2)', fontWeight: 700 }}>{refreshing ? 'Checking subscription...' : 'Refresh subscription'}</button>}
        {managementUrl && isPaid && <button type="button" onClick={() => setConfirming(true)} style={{ padding: '10px 13px', borderRadius: 12, border: 0, background: 'var(--primary)', color: 'var(--primary-contrast)', fontWeight: 700 }}>Manage subscription</button>}
      </div>

      {isPaid && !managementUrl && <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: 12 }}>Subscription management is handled through your billing provider. No provider management link is available in this session.</p>}

      {confirming && <div role="dialog" aria-modal="true" aria-labelledby="manage-confirm-title" style={{ marginTop: 16, padding: 16, borderRadius: 14, background: 'var(--primary-bg)', border: '1px solid color-mix(in srgb, var(--primary) 20%, var(--border))' }}>
        <strong id="manage-confirm-title">Manage your subscription?</strong>
        <p style={{ margin: '8px 0 14px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>You will be redirected to your billing provider. Your paid features remain active until the provider confirms any cancellation and the current billing period ends.</p>
        <div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={openManagement} style={{ padding: '9px 12px', border: 0, borderRadius: 10, background: 'var(--primary)', color: 'var(--primary-contrast)', fontWeight: 700 }}>Continue</button><button type="button" onClick={() => setConfirming(false)} style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', color: 'var(--text-2)', fontWeight: 700 }}>Go back</button></div>
      </div>}
    </section>
  )
}
