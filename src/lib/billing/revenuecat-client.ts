'use client'

import { useEffect, useState } from 'react'
import { Purchases, type CustomerInfo, type Offering, type Package } from '@revenuecat/purchases-js'
import { supabase } from '@/lib/supabase'
import { clearSubscriptionState, refreshSubscription, waitForSubscriptionPlan } from './client'
import type { PlanId } from './plans'

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
let initialization: Promise<RevenueCatClientState> | null = null
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

export function isRevenueCatWebConfigured(): boolean {
  return typeof window !== 'undefined' && Boolean(publicApiKey())
}

export async function initializeRevenueCat(userId: string): Promise<RevenueCatClientState> {
  if (typeof window === 'undefined') return state({ configured: false, initialized: false, loading: false })

  const apiKey = publicApiKey()
  if (!apiKey) return state({ configured: false, initialized: false, loading: false, error: null })
  if (currentUserId === userId && instance) return cachedState
  if (initialization) return initialization

  initialization = (async () => {
    try {
      if (instance && currentUserId !== userId) {
        instance.close()
        instance = null
        currentUserId = null
        clearSubscriptionState()
      }

      instance = Purchases.isConfigured()
        ? Purchases.getSharedInstance()
        : Purchases.configure({ apiKey, appUserId: userId })
      currentUserId = userId

      const [offerings, customerInfo] = await Promise.all([
        instance.getOfferings(),
        instance.getCustomerInfo(),
      ])

      return state({
        configured: true,
        initialized: true,
        loading: false,
        error: null,
        offering: offerings.current,
        customerInfo,
      })
    } catch (error) {
      console.error('[KAYVEN Billing] RevenueCat initialization failed', error)
      instance = null
      currentUserId = null
      return state({ configured: true, initialized: false, loading: false, error: 'Billing is unavailable right now.' })
    } finally {
      initialization = null
    }
  })()

  state({ configured: true, loading: true, error: null })
  return initialization
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
    console.error('[KAYVEN Billing] RevenueCat refresh failed', error)
    return state({ error: 'Billing is unavailable right now.' })
  }
}

async function syncServerSubscription(expectedPlan?: Exclude<PlanId, 'free'>): Promise<void> {
  await refreshSubscription()
  if (expectedPlan) {
    const confirmed = await waitForSubscriptionPlan(expectedPlan)
    if (!confirmed) throw new Error('The provider has not confirmed the subscription yet.')
  }
}

export async function purchaseRevenueCatPackage(pkg: Package): Promise<RevenueCatClientState> {
  if (!instance) throw new Error('Billing is not configured.')
  await instance.purchase({ rcPackage: pkg })
  const next = await refreshRevenueCatState()
  const expectedPlan = getPublicProductPlan(pkg.webBillingProduct.identifier)
  await syncServerSubscription(expectedPlan || undefined)
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
  return initializeRevenueCat(user.id)
}

export function useRevenueCat() {
  const [stateValue, setStateValue] = useState(cachedState)

  useEffect(() => {
    let active = true
    const listener = (nextState: RevenueCatClientState) => {
      if (active) setStateValue(nextState)
    }
    listeners.add(listener)

    getAuthenticatedRevenueCatState().then(nextState => {
      if (active) setStateValue(nextState)
    })

    const authSubscription = supabase.auth.onAuthStateChange((_event: string, userSession: { user?: { id: string } | null } | null) => {
      if (!userSession?.user) {
        clearRevenueCatClientState()
        return
      }
      if (currentUserId !== userSession.user.id) clearSubscriptionState()
      void initializeRevenueCat(userSession.user.id)
    })

    return () => {
      active = false
      listeners.delete(listener)
      authSubscription?.data?.subscription?.unsubscribe?.()
    }
  }, [])

  return {
    ...stateValue,
    purchase: purchaseRevenueCatPackage,
    restore: restoreRevenueCatPurchases,
    refresh: refreshRevenueCatState,
  }
}
