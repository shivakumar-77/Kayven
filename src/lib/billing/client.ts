'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EntitlementId, Entitlements } from './entitlements'
import type { PlanId } from './plans'

let cachedState: ClientSubscriptionState | null = null
let cachedError: string | null = null
let request: Promise<ClientSubscriptionState> | null = null
const listeners = new Set<(state: ClientSubscriptionState | null) => void>()

function unavailableSubscriptionState(): ClientSubscriptionState {
  return {
    currentPlan: 'free',
    subscriptionStatus: 'free',
    entitlements: {
      food_tracking: true,
      basic_insights: true,
      ai_coach: { enabled: true, limit: 10 },
      advanced_ai_coach: false,
      meal_planning: true,
      advanced_meal_planning: false,
      workout_planning: false,
      advanced_progress: false,
      supplements: true,
      health_insights: false,
    },
    aiUsage: 0,
    aiLimit: 10,
    remainingAIRequests: 10,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    billingProvider: null,
    billingPeriod: null,
    billingPurchasesEnabled: false,
    managementUrl: null,
    managementUrlAvailable: false,
    statusUnavailable: true,
  }
}

export async function authenticatedBillingFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data?.session?.access_token
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  return fetch(input, { ...init, headers, cache: 'no-store' })
}

async function fetchSubscriptionState(): Promise<ClientSubscriptionState> {
  if (!request) {
    request = authenticatedBillingFetch('/api/subscription')
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Unable to load subscription state')
        return payload as ClientSubscriptionState
      })
      .then(payload => {
        cachedState = payload
        cachedError = null
        listeners.forEach(listener => listener(payload))
        return payload
      })
      .catch(error => {
        cachedError = error instanceof Error ? error.message : 'Unable to load subscription state'
        const fallback = unavailableSubscriptionState()
        cachedState = fallback
        listeners.forEach(listener => listener(fallback))
        return fallback
      })
      .finally(() => { request = null })
  }

  return request
}

export async function refreshSubscription(): Promise<ClientSubscriptionState> {
  cachedState = null
  cachedError = null
  const response = await authenticatedBillingFetch('/api/subscription/refresh', { method: 'POST' })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to refresh subscription state')
  }

  const state = await fetchSubscriptionState()
  if (state.statusUnavailable) {
    throw new Error(cachedError || 'Unable to load subscription state')
  }
  return state
}

export function clearSubscriptionState(): void {
  cachedState = null
  cachedError = null
  request = null
  listeners.forEach(listener => listener(null))
}

export async function waitForSubscriptionPlan(
  expectedPlan: PlanId,
  options: { timeoutMs?: number; intervalMs?: number; expectedBillingPeriod?: 'monthly' | 'yearly' } = {},
): Promise<ClientSubscriptionState | null> {
  const timeoutMs = options.timeoutMs ?? 8000
  const intervalMs = options.intervalMs ?? 1000
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const current = await fetchSubscriptionState()
      if (current.currentPlan === expectedPlan
        && (!options.expectedBillingPeriod || current.billingPeriod === options.expectedBillingPeriod)) return current
    } catch {
      // Keep polling boundedly; the server remains authoritative.
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  return null
}

export interface ClientSubscriptionState {
  currentPlan: PlanId
  subscriptionStatus: string
  entitlements: Entitlements
  aiUsage: number
  aiLimit: number | null
  remainingAIRequests: number | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  billingProvider: string | null
  billingPeriod: 'monthly' | 'yearly' | null
  billingPurchasesEnabled: boolean
  managementUrl: string | null
  managementUrlAvailable: boolean
  statusUnavailable?: boolean
}

export function useSubscription() {
  const [state, setState] = useState<ClientSubscriptionState | null>(cachedState)
  const [loading, setLoading] = useState(!cachedState)
  const [error, setError] = useState<string | null>(cachedError)

  useEffect(() => {
    let active = true

    const listener = (nextState: ClientSubscriptionState | null) => {
      if (active) {
        setState(nextState)
        setError(cachedError)
        setLoading(false)
      }
    }
    listeners.add(listener)

    if (!cachedState) {
      fetchSubscriptionState()
        .then(payload => { if (active) setState(payload) })
        .catch(requestError => {
          if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load subscription state')
        })
        .finally(() => { if (active) setLoading(false) })
    }

    return () => { active = false; listeners.delete(listener) }
  }, [])

  return { state, loading, error }
}

export function useEntitlement(feature: EntitlementId) {
  const subscription = useSubscription()
  const value = subscription.state?.entitlements[feature]
  const enabled = !subscription.state?.statusUnavailable
    && (typeof value === 'boolean' ? value : value?.enabled === true)
  return { ...subscription, enabled }
}

export function useAIUsage() {
  const subscription = useSubscription()
  return {
    ...subscription,
    usage: subscription.state?.aiUsage ?? 0,
    limit: subscription.state?.aiLimit ?? null,
    remaining: subscription.state?.remainingAIRequests ?? null,
  }
}
