'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import SubscriptionStatusCard from '@/components/SubscriptionStatusCard'
import AIUsageMeter from '@/components/AIUsageMeter'
import { refreshSubscription, useSubscription } from '@/lib/billing/client'

import UpgradePrompt from '@/components/UpgradePrompt'

export default function SubscriptionManagePage() {
  const router = useRouter()
  const { state, loading, error } = useSubscription()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      await refreshSubscription()
    } catch {
      setRefreshError('Unable to refresh subscription details. Please try again.')
    } finally {
      setIsRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <PageHeader title="Loading subscription..." />
        <div style={{ marginTop: 20 }}>
          <div aria-busy="true" role="status">Loading subscription details...</div>
        </div>
        <BottomNav />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="Error loading subscription" />
        <div style={{ color: 'var(--orange)', marginTop: 20 }}>
          Failed to load subscription details. Please try again later.
        </div>
        <button
          onClick={() => router.refresh()}
          style={{
            marginTop: 12,
            minHeight: 44,
            padding: '8px 16px',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text-2)',
            borderRadius: 99,
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
        <BottomNav />
      </div>
    )
  }

  if (!state) {
    return (
      <div style={{ padding: 20 }}>
        <PageHeader title="No subscription found" />
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p>You’re currently using the Free plan.</p>
          <UpgradePrompt
            title="Compare available plans"
            message="Review the configured plan features and AI Coach allowances before deciding."
            suggestedPlan="basic"
            context="feature_locked"
          />
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Subscription Management" />
      <div style={{ padding: 20 }}>
        <SubscriptionStatusCard
          state={state}
          managementUrl={state.managementUrlAvailable ? state.managementUrl : null}
          onRefresh={handleRefresh}
          refreshing={isRefreshing}
        />
        {refreshError && <p role="alert" style={{ color: 'var(--orange)', marginTop: 10 }}>{refreshError}</p>}

        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 16, color: 'var(--text)' }}>Plan options</h2>
          <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Review the current tier comparison and any configured purchase options.</p>
          <Link href="/subscription" style={{ color: 'var(--primary)', fontWeight: 750 }}>View plans and comparison</Link>
        </div>

        <AIUsageMeter compact={false} />

        <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 16, color: 'var(--text)' }}>Payment history</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Kayven does not currently store payment history or invoice links. Use the billing provider’s account tools where available.</p>
        </div>

      </div>

      <BottomNav />
    </>
  )
}