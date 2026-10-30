'use client'

import { useEffect, useState } from 'react'
import { Purchases, type CustomerInfo, type Offering, type Package } from '@revenuecat/purchases-js'
import { supabase } from '@/lib/supabase'
import { authenticatedBillingFetch, clearSubscriptionState, refreshSubscription, waitForSubscriptionPlan } from './client'
import { hasUnapprovedOfferPhase } from './revenuecat-offers'
import { getPublicRevenueCatWebProductMapping, isRevenueCatCheckoutAllowed } from './revenuecat-products'
import type { BillingPeriod, PaidPlanId, PlanId } from './plans'

export interface RevenueCatClientState {
  configured: boolean
  initialized: boolean
  loading: boolean
  error: string | null
  offering: Offering | null
  customerInfo: CustomerInfo | null
}

let instance: Purchases | null = null
let currentUserId: string | null = null
let initialization: { userId: string; promise: Promise<RevenueCatClientState> } | null = null
let initializationGeneration = 0
let cachedState: RevenueCatClientState = {
  configured: false,
  initialized: false,
  loading: false,
  error: null,
  offering: null,
  customerInfo: null,
}
const listeners = new Set<(nextState: RevenueCatClientState) => void>()

function publicApiKey(): string | null {
  return process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY?.trim() || null
}

export function getPublicProductPlan(productId: string): Exclude<PlanId, 'free'> | null {
  const mappings: Array<[string | undefined, Exclude<PlanId, 'free'>]> = [
    [process.env.NEXT_PUBLIC_REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID, 'premium'],
    [process.env.NEXT_PUBLIC_REVENUECAT_PREMIUM_YEARLY_PRODUCT_ID, 'premium'],
    [process.env.NEXT_PUBLIC_REVENUECAT_PRO_MONTHLY_PRODUCT_ID, 'pro'],
    [process.env.NEXT_PUBLIC_REVENUECAT_PRO_YEARLY_PRODUCT_ID, 'pro'],
  ]
  return mappings.find(([configuredProductId]) => configuredProductId === productId)?.[1] || null
}

function state(overrides: Partial<RevenueCatClientState>): RevenueCatClientState {
  cachedState = { ...cachedState, ...overrides }
  listeners.forEach(listener => listener(cachedState))
  return cachedState
}

function logRevenueCatFailure(action: string, error: unknown): void {
  console.error(`[KAYVEN Billing] RevenueCat ${action} failed`, {
    errorType: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : 'RevenueCat returned a non-Error failure',
  })
}

export function isRevenueCatWebConfigured(): boolean {
  return typeof window !== 'undefined' && Boolean(publicApiKey())
}

export async function initializeRevenueCat(userId: string): Promise<RevenueCatClientState> {
  if (typeof window === 'undefined') return state({ configured: false, initialized: false, loading: false })

  const activeUserId = initialization?.userId ?? currentUserId
  if (activeUserId && activeUserId !== userId) clearRevenueCatClientState()

  const apiKey = publicApiKey()
  if (!apiKey) return state({ configured: false, initialized: false, loading: false, error: null })
  if (currentUserId === userId && instance) return cachedState
  if (initialization?.userId === userId) return initialization.promise

  const generation = initializationGeneration
  let promise: Promise<RevenueCatClientState>
  promise = (async () => {
    let initializedInstance: Purchases | null = null
    try {
      if (Purchases.isConfigured()) {
        initializedInstance = Purchases.getSharedInstance()
        await initializedInstance.identifyUser(userId)
      } else {
        initializedInstance = Purchases.configure({ apiKey, appUserId: userId })
      }
      instance = initializedInstance
      currentUserId = userId

      const [offeringsResult, customerInfoResult] = await Promise.allSettled([
        initializedInstance.getOfferings(),
        initializedInstance.getCustomerInfo(),
      ])

      if (generation !== initializationGeneration || instance !== initializedInstance || currentUserId !== userId) {
        return cachedState
      }

      const offering = offeringsResult.status === 'fulfilled' ? offeringsResult.value.current : null
      const customerInfo = customerInfoResult.status === 'fulfilled' ? customerInfoResult.value : null
      const failedRequests: Array<{ action: string; error: unknown }> = []
      if (offeringsResult.status === 'rejected') {
        failedRequests.push({ action: 'offerings', error: offeringsResult.reason })
      }
      if (customerInfoResult.status === 'rejected') {
        failedRequests.push({ action: 'customer info', error: customerInfoResult.reason })
      }
      failedRequests.forEach(({ action, error }) => logRevenueCatFailure(action, error))

      return state({
        configured: true,
        initialized: true,
        loading: false,
        error: failedRequests.length ? 'Some billing details are temporarily unavailable.' : null,
        offering,
        customerInfo,
      })
    } catch (error) {
      logRevenueCatFailure('initialization', error)
      if (generation !== initializationGeneration) return cachedState
      if (instance === initializedInstance) {
        instance = null
        currentUserId = null
      }
      return state({ configured: true, initialized: false, loading: false, error: 'Billing is unavailable right now.' })
    } finally {
      if (initialization?.promise === promise) initialization = null
    }
  })()
  initialization = { userId, promise }

  state({ configured: true, loading: true, error: null })
  return promise
}

export async function refreshRevenueCatState(): Promise<RevenueCatClientState> {
  if (!instance) return cachedState

  try {
    const [offerings, customerInfo] = await Promise.all([
      instance.getOfferings(),
      instance.getCustomerInfo(),
    ])
    return state({ offering: offerings.current, customerInfo, error: null })
  } catch (error) {
    logRevenueCatFailure('refresh', error)
    return state({ error: 'Billing is unavailable right now.' })
  }
}

async function syncServerSubscription(expectedPlan?: Exclude<PlanId, 'free'>, expectedBillingPeriod?: BillingPeriod): Promise<void> {
  await refreshSubscription()
  if (expectedPlan) {
    const confirmed = await waitForSubscriptionPlan(expectedPlan, { expectedBillingPeriod })
    if (!confirmed) throw new Error('The provider has not confirmed the subscription yet.')
  }
}

export async function purchaseRevenueCatPackage(pkg: Package): Promise<RevenueCatClientState> {
  const purchaseInstance = instance
  const purchaseUserId = currentUserId
  if (!purchaseInstance || !purchaseUserId) throw new Error('Billing is not configured.')
  const mapping = getPublicRevenueCatWebProductMapping(pkg.webBillingProduct.identifier)
  if (!mapping) throw new Error('This product is not configured for Kayven web checkout.')
  if (hasUnapprovedOfferPhase(pkg.webBillingProduct)) {
    throw new Error('This product includes a trial or introductory price that has not been approved.')
  }

  const subscriptionResponse = await authenticatedBillingFetch('/api/subscription')
  if (!subscriptionResponse.ok) throw new Error('Purchases are not available for this account right now.')
  const subscriptionState = await subscriptionResponse.json() as {
    currentPlan?: string
    billingPurchasesEnabled?: boolean
    statusUnavailable?: boolean
  }
  if (!isRevenueCatCheckoutAllowed(subscriptionState)) {
    throw new Error('Purchases are not available for this account right now.')
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== purchaseUserId || instance !== purchaseInstance || currentUserId !== purchaseUserId) {
    throw new Error('Purchases are not available for this account right now.')
  }

  await purchaseInstance.purchase({ rcPackage: pkg })
  const next = await refreshRevenueCatState()
  await syncServerSubscription(mapping.planId, mapping.billingPeriod)
  return next
}

export async function restoreRevenueCatPurchases(): Promise<RevenueCatClientState> {
  if (!instance) throw new Error('Billing is not configured.')
  const customerInfo = await instance.getCustomerInfo()
  const next = state({ customerInfo, error: null })
  await syncServerSubscription()
  return next
}

export function clearRevenueCatClientState(): void {
  initializationGeneration += 1
  if (instance) instance.close()
  instance = null
  currentUserId = null
  initialization = null
  clearSubscriptionState()
  cachedState = {
    configured: false,
    initialized: false,
    loading: false,
    error: null,
    offering: null,
    customerInfo: null,
  }
  listeners.forEach(listener => listener(cachedState))
}

export function getRevenueCatClientState(): RevenueCatClientState {
  return cachedState
}

export async function getAuthenticatedRevenueCatState(): Promise<RevenueCatClientState> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    clearRevenueCatClientState()
    return cachedState
  }
  if (currentUserId === user.id && instance) return refreshRevenueCatState()
  return initializeRevenueCat(user.id)
}

async function retryRevenueCatInitialization(): Promise<RevenueCatClientState> {
  try {
    return await getAuthenticatedRevenueCatState()
  } catch (error) {
    logRevenueCatFailure('retry', error)
    return state({ error: 'Billing is unavailable right now.', loading: false })
  }
}

export function useRevenueCat(enabled = true) {
  const [stateValue, setStateValue] = useState(cachedState)

  useEffect(() => {
    if (!enabled) return
    let active = true
    const listener = (nextState: RevenueCatClientState) => {
      if (active) setStateValue(nextState)
    }
    listeners.add(listener)

    retryRevenueCatInitialization().then(nextState => {
      if (active) setStateValue(nextState)
    })

    const authSubscription = supabase.auth.onAuthStateChange((_event: string, userSession: { user?: { id: string } | null } | null) => {
      if (!userSession?.user) {
        clearRevenueCatClientState()
        return
      }
      const activeUserId = initialization?.userId ?? currentUserId
      if (activeUserId !== userSession.user.id) clearRevenueCatClientState()
      void initializeRevenueCat(userSession.user.id)
    })

    return () => {
      active = false
      listeners.delete(listener)
      authSubscription?.data?.subscription?.unsubscribe?.()
    }
  }, [enabled])

  return {
    ...stateValue,
    purchase: purchaseRevenueCatPackage,
    restore: restoreRevenueCatPurchases,
    refresh: refreshRevenueCatState,
    retry: retryRevenueCatInitialization,
  }
}
