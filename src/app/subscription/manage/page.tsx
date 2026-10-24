'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
          <p>You don't have an active subscription.</p>
          <UpgradePrompt
            title="Start your subscription"
            message="Choose a plan to access all features"
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

        {/* Add some spacing */}
        <div style={{ height: 24 }}></div>

        <AIUsageMeter compact={false} />

        {/* Add some spacing */}
        <div style={{ height: 24 }}></div>

        {/* Upgrade prompt for free users or those with limits */}
        {['free', 'basic', 'premium'].includes(state.currentPlan) && (
          <UpgradePrompt
            title="Unlock more features"
            message="Upgrade your plan to access premium features and higher limits"
            suggestedPlan={state.currentPlan === 'free' ? 'basic' : 'standard'}
            context="feature_locked"
          />
        )}
      </div>

      <BottomNav />
    </>
  )
}