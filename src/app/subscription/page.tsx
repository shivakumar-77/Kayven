'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ProductType, type Package } from '@revenuecat/purchases-js'
import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import { authenticatedBillingFetch, useSubscription } from '@/lib/billing/client'
import { canUseFeature, getAIRequestLimit, getPlanEntitlements } from '@/lib/billing/entitlements'
import { isRevenueCatWebConfigured, useRevenueCat } from '@/lib/billing/revenuecat-client'
import { hasUnapprovedOfferPhase } from '@/lib/billing/revenuecat-offers'
import { getPublicRevenueCatWebProductMapping } from '@/lib/billing/revenuecat-products'
import { PAID_PLAN_IDS, PLAN_COMPARISON_FEATURES, PLANS, type BillingPeriod, type PaidPlanId, type PlanId } from '@/lib/billing/plans'

type PurchaseState = 'idle' | 'review' | 'processing' | 'success' | 'error'

function statusLabel(status: string, cancelAtPeriodEnd: boolean) {
  if (cancelAtPeriodEnd) return 'Canceling at period end'
  if (status === 'trialing') return 'Trialing'
  if (status === 'past_due') return 'Payment issue'
  if (status === 'canceled') return 'Canceled'
  if (status === 'expired') return 'Expired'
  return status === 'free' ? 'Free' : 'Active'
}

function dateLabel(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function priceUnavailableMessage(
  loading: boolean,
  error: string | null,
  configured: boolean,
  hasOffering: boolean,
): string {
  if (loading) return 'Loading price…'
  if (error) return 'Pricing is temporarily unavailable.'
  if (!configured || !hasOffering) return 'Plans are not available right now.'
  return 'No price is available for this billing period.'
}

function packageForPlan(packages: Package[], planId: PaidPlanId, billingPeriod: BillingPeriod) {
  return packages.find(pkg => {
    const mapping = getPublicRevenueCatWebProductMapping(pkg.webBillingProduct.identifier)
    return mapping?.planId === planId
      && mapping.billingPeriod === billingPeriod
      && pkg.webBillingProduct.productType === ProductType.Subscription
  }) ?? null
}

function calculateYearlySavings(monthly: Package | null, yearly: Package | null) {
  if (!monthly || !yearly) return null
  const monthlyPrice = monthly.webBillingProduct.price
  const yearlyPrice = yearly.webBillingProduct.price
  if (!monthlyPrice.currency || monthlyPrice.currency !== yearlyPrice.currency) return null
  const annualMonthlyCost = monthlyPrice.amountMicros * 12
  const savings = annualMonthlyCost - yearlyPrice.amountMicros
  if (savings <= 0) return null

  try {
    return {
      percent: Math.round((savings / annualMonthlyCost) * 100),
      amount: new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: yearlyPrice.currency,
        maximumFractionDigits: 2,
      }).format(savings / 1_000_000),
    }
  } catch {
    return null
  }
}

function featureIncluded(planId: PlanId, row: typeof PLAN_COMPARISON_FEATURES[number]) {
  if (row.availableForAllPlans) return true
  if (!row.entitlement) return false
  return canUseFeature(getPlanEntitlements(planId), row.entitlement)
}

export default function SubscriptionPage() {
  const { state: subscriptionState, loading: subscriptionLoading, error: subscriptionError } = useSubscription()
  const revenueCatEnabled = isRevenueCatWebConfigured()
  const revenueCat = useRevenueCat(revenueCatEnabled)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [showFreeDetails, setShowFreeDetails] = useState(false)
  const [purchaseState, setPurchaseState] = useState<PurchaseState>('idle')
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [purchaseError, setPurchaseError] = useState('')

  const availablePackages = revenueCat.offering?.availablePackages ?? []
  const purchasePackage = selectedPackage
  const currentPlanId = subscriptionState?.currentPlan ?? 'free'
  const currentPlan = PLANS[currentPlanId] ?? PLANS.free
  const statusVerified = Boolean(subscriptionState && !subscriptionState.statusUnavailable && !subscriptionError)
  const freeAIUsage = subscriptionState?.aiUsage ?? 0
  const freeAILimit = subscriptionState?.aiLimit ?? 0

  async function confirmPurchase() {
    if (!purchasePackage || !subscriptionState?.billingPurchasesEnabled || currentPlanId !== 'free') return
    setPurchaseState('processing')
    setPurchaseError('')
    try {
      await revenueCat.purchase(purchasePackage)
      setPurchaseState('success')
      setSelectedPackage(null)
    } catch (error) {
      setPurchaseState('error')
      setPurchaseError(error instanceof Error ? error.message : 'The purchase could not be completed. Please try again.')
    }
  }

  async function retrySubscriptionLoad() {
    try {
      const response = await authenticatedBillingFetch('/api/subscription', { method: 'GET' })
      if (!response.ok) throw new Error('Subscription state could not be refreshed.')
      window.location.reload()
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : 'Unable to refresh subscription state.')
    }
  }

  const statusText = subscriptionState
    ? statusLabel(subscriptionState.subscriptionStatus, subscriptionState.cancelAtPeriodEnd)
    : 'Checking status'

  return (
    <main className="plans-surface" style={{ minHeight: '100dvh', background: 'var(--surface)', paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 0px))' }}>
      <PageHeader title="Plans & Billing" href="/dashboard" />
      <div style={{ width: 'min(100% - 28px, 980px)', margin: '0 auto', padding: '8px 0 28px' }}>
        <header style={{ margin: '8px 0 20px' }}>
          <p style={{ margin: 0, color: 'var(--primary)', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>KAYVEN MEMBERSHIP</p>
          <h1 style={{ margin: '7px 0', color: 'var(--text)', fontSize: 28, lineHeight: 1.15, letterSpacing: '-.035em' }}>A plan that fits your goals</h1>
          <p style={{ margin: 0, maxWidth: 640, color: 'var(--muted)', lineHeight: 1.55 }}>Choose the level of coaching and insight that fits your routine, with each plan’s available tools and AI Coach allowance shown upfront.</p>
        </header>

        <section aria-labelledby="current-plan-heading" className="card" style={{ marginBottom: 20, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>Current plan</p>
              <h2 id="current-plan-heading" style={{ margin: '6px 0 4px', color: 'var(--text)', fontSize: 21 }}>
                {statusVerified ? currentPlan.displayName : subscriptionLoading ? 'Checking your plan…' : 'Plan status unavailable'}
              </h2>
              {statusVerified && currentPlanId === 'free' && <p style={{ margin: 0, color: 'var(--muted)' }}>You’re currently on the Free plan.</p>}
              {statusVerified && currentPlanId !== 'free' && <>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  {statusText}{subscriptionState?.billingPeriod ? ` · billed ${subscriptionState.billingPeriod}` : ''}
                </p>
                {subscriptionState?.currentPeriodStart && <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>Billing period began {dateLabel(subscriptionState.currentPeriodStart)}.</p>}
                {subscriptionState?.currentPeriodEnd && <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                  {subscriptionState.cancelAtPeriodEnd
                    ? 'Access through'
                    : subscriptionState.subscriptionStatus === 'trialing'
                      ? 'Trial ends'
                      : subscriptionState.subscriptionStatus === 'past_due'
                        ? 'Current period ends'
                        : 'Next renewal'} {dateLabel(subscriptionState.currentPeriodEnd)}.
                </p>}
              </>}
              {!statusVerified && !subscriptionLoading && <p role="alert" style={{ margin: 0, color: 'var(--red)' }}>We couldn’t verify your current plan. Purchasing is disabled until the account status loads.</p>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {statusVerified && currentPlanId === 'free' && <button type="button" onClick={() => setShowFreeDetails(value => !value)} aria-expanded={showFreeDetails} style={{ minHeight: 44, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 750, cursor: 'pointer' }}>{showFreeDetails ? 'Hide details' : 'View details'}</button>}
              {statusVerified && currentPlanId !== 'free' && <Link href="/subscription/manage" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: 'var(--primary-bg)', color: 'var(--primary)', fontWeight: 750, textDecoration: 'none' }}>Manage billing</Link>}
              {!statusVerified && <button type="button" onClick={() => void retrySubscriptionLoad()} style={{ minHeight: 44, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 750, cursor: 'pointer' }}>Retry</button>}
            </div>
          </div>

          {showFreeDetails && statusVerified && currentPlanId === 'free' && <div style={{ marginTop: 17, padding: 16, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 16 }}>Your Free plan</h3>
            <p style={{ margin: '0 0 8px', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>Status: Free</p>
            <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Your current AI Coach usage is {freeAIUsage}{freeAILimit > 0 ? ` of ${freeAILimit} requests this month` : ' requests this month'}.</p>
            <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px 18px', margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>
              {PLAN_COMPARISON_FEATURES.filter(row => featureIncluded('free', row)).map(row => <li key={row.id}>{row.label}</li>)}
            </ul>
            <p style={{ margin: '12px 0 0', color: 'var(--muted)', fontSize: 12 }}>Paid plans offer different AI Coach allowances and available insights.</p>
            <Link href="#available-plans-heading" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', marginTop: 8, color: 'var(--primary)', fontWeight: 750 }}>View available upgrades</Link>
          </div>}

        </section>

        {subscriptionState?.statusUnavailable && <p role="alert" style={{ margin: '0 0 14px', color: 'var(--red)' }}>Subscription state is unavailable; plan purchases are disabled.</p>}
        {revenueCat.error && <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14, padding: 12, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          <span>Plans are temporarily unavailable. Please try again.</span>
          <button type="button" onClick={() => void revenueCat.retry()} style={{ minHeight: 44, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text)', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </div>}
        {purchaseState === 'success' && <p role="status" style={{ padding: 12, borderRadius: 12, background: 'var(--green-bg)', color: 'var(--green)' }}>Your subscription is active and your plan is updated.</p>}

        <section aria-labelledby="available-plans-heading" style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 13 }}>
            <div>
              <h2 id="available-plans-heading" style={{ margin: 0, color: 'var(--text)', fontSize: 20 }}>Choose a paid plan</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Free is your existing account plan, not a purchase option.</p>
            </div>
            <div role="group" aria-label="Billing frequency" style={{ display: 'inline-flex', padding: 4, borderRadius: 13, background: 'var(--card2)', border: '1px solid var(--border)' }}>
              {(['monthly', 'yearly'] as const).map(period => <button key={period} type="button" aria-pressed={billingPeriod === period} onClick={() => { setBillingPeriod(period); setSelectedPackage(null); setPurchaseState('idle') }} style={{ minHeight: 44, padding: '8px 13px', border: 0, borderRadius: 10, background: billingPeriod === period ? 'var(--card)' : 'transparent', color: billingPeriod === period ? 'var(--text)' : 'var(--muted)', font: 'inherit', fontSize: 13, fontWeight: 750, cursor: 'pointer', boxShadow: billingPeriod === period ? 'var(--shadow-sm)' : 'none' }}>{period === 'monthly' ? 'Monthly' : 'Yearly'}</button>)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 245px), 1fr))', gap: 12 }}>
            {PAID_PLAN_IDS.map(planId => {
              const plan = PLANS[planId]
              const pkg = packageForPlan(availablePackages, planId, billingPeriod)
              const product = pkg?.webBillingProduct
              const offerNeedsReview = Boolean(product && hasUnapprovedOfferPhase(product))
              const isCurrentPlan = statusVerified && currentPlanId === planId
              const savings = billingPeriod === 'yearly'
                ? calculateYearlySavings(packageForPlan(availablePackages, planId, 'monthly'), pkg)
                : null
              const features = PLAN_COMPARISON_FEATURES.filter(row => featureIncluded(planId, row))
              const aiLimit = getAIRequestLimit(getPlanEntitlements(planId))
              const canPurchase = Boolean(
                statusVerified
                && currentPlanId === 'free'
                && subscriptionState?.billingPurchasesEnabled
                && pkg
                && product
                && !offerNeedsReview,
              )
              return <article key={planId} className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, padding: 18, border: isCurrentPlan ? '1px solid var(--primary)' : '1px solid var(--border)', boxShadow: isCurrentPlan ? '0 0 0 1px color-mix(in srgb, var(--primary) 18%, transparent)' : 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 19 }}>{plan.displayName}</h3>
                    <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>{plan.description}</p>
                  </div>
                  {isCurrentPlan && <span style={{ flexShrink: 0, padding: '5px 8px', borderRadius: 99, background: 'var(--primary-bg)', color: 'var(--primary)', fontSize: 10, fontWeight: 800 }}>CURRENT</span>}
                </div>

                <div style={{ minHeight: 78, marginTop: 18 }} aria-live="polite">
                  {product && !offerNeedsReview
                    ? <><strong style={{ display: 'block', color: 'var(--text)', fontSize: 27, letterSpacing: '-.03em' }}>{product.price.formattedPrice}</strong><span style={{ color: 'var(--muted)', fontSize: 12 }}>{billingPeriod === 'monthly' ? 'charged monthly' : 'total charged yearly'}</span></>
                    : <><strong style={{ display: 'block', color: 'var(--muted)', fontSize: 17 }}>{offerNeedsReview ? 'Offer unavailable' : revenueCat.loading ? 'Loading price…' : 'Price unavailable'}</strong><span style={{ color: 'var(--muted)', fontSize: 12 }}>{offerNeedsReview ? 'This offer is not available right now.' : priceUnavailableMessage(revenueCat.loading, revenueCat.error, revenueCat.configured, Boolean(revenueCat.offering))}</span></>}
                  {savings && product && !offerNeedsReview && <p style={{ margin: '6px 0 0', color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>Save {savings.percent}% ({savings.amount} vs 12 monthly charges)</p>}
                </div>

                <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 12 }}>Billed {billingPeriod === 'monthly' ? 'monthly' : 'yearly'}{billingPeriod === 'yearly' && product ? ` · ${product.price.formattedPrice} due today` : ''}. Review the provider’s final renewal terms and any applicable taxes before paying.</p>

                <ul style={{ display: 'grid', gap: 8, margin: '0 0 18px', padding: 0, listStyle: 'none', color: 'var(--text-2)', fontSize: 13 }}>
                  {features.map(row => <li key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'start' }}><span aria-hidden="true" style={{ color: 'var(--green)', fontWeight: 900 }}>✓</span><span>{row.label}</span></li>)}
                  <li style={{ display: 'flex', gap: 8, alignItems: 'start' }}><span aria-hidden="true" style={{ color: 'var(--green)', fontWeight: 900 }}>✓</span><span>AI Coach: {aiLimit === null ? 'unlimited requests' : `${aiLimit} requests per month`}</span></li>
                </ul>

                <button type="button" disabled={!canPurchase || purchaseState === 'processing'} onClick={() => {
                  if (!pkg || !product || offerNeedsReview) return
                  setSelectedPackage(pkg)
                  setPurchaseState('review')
                  setPurchaseError('')
                }} style={{ minHeight: 46, marginTop: 'auto', padding: '11px 14px', border: 0, borderRadius: 12, background: isCurrentPlan ? 'var(--card2)' : canPurchase ? 'var(--primary)' : 'var(--card2)', color: canPurchase && !isCurrentPlan ? '#fff' : 'var(--muted)', font: 'inherit', fontSize: 14, fontWeight: 800, cursor: canPurchase ? 'pointer' : 'not-allowed' }}>
                  {isCurrentPlan ? 'Current plan' : statusVerified && currentPlanId !== 'free' ? 'Plan changes unavailable' : offerNeedsReview ? 'Offer unavailable' : !pkg ? revenueCat.loading ? 'Loading price…' : 'Unavailable right now' : !subscriptionState?.billingPurchasesEnabled ? 'Purchases unavailable' : 'Review purchase'}
                </button>
                {statusVerified && currentPlanId !== 'free' && !isCurrentPlan && <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 11, lineHeight: 1.4 }}>Plan changes are disabled until the provider’s upgrade/downgrade behavior is verified.</p>}
              </article>
            })}
          </div>

          {(purchaseState === 'review' || purchaseState === 'processing') && purchasePackage && <section aria-label="Purchase review" style={{ marginTop: 14, padding: 18, borderRadius: 16, background: 'var(--primary-bg)', border: '1px solid color-mix(in srgb, var(--primary) 25%, var(--border))' }}>
            <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 17 }}>Review your subscription</h3>
            <p style={{ margin: '8px 0 4px', color: 'var(--text-2)', lineHeight: 1.5 }}>
              {PLANS[getPublicRevenueCatWebProductMapping(purchasePackage.webBillingProduct.identifier)?.planId ?? 'free'].displayName} · billed {billingPeriod === 'monthly' ? 'monthly' : 'yearly'} · {purchasePackage.webBillingProduct.price.formattedPrice} due now.
            </p>
            <p style={{ margin: '0 0 13px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>Review the provider’s actual recurring renewal terms and tax details before completing payment. Kayven grants paid access only after the provider confirms the purchase and the server verifies the subscription.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" disabled={purchaseState === 'processing'} aria-busy={purchaseState === 'processing'} onClick={() => void confirmPurchase()} style={{ minHeight: 44, padding: '10px 14px', border: 0, borderRadius: 11, background: 'var(--primary)', color: '#fff', fontWeight: 800, cursor: purchaseState === 'processing' ? 'wait' : 'pointer' }}>{purchaseState === 'processing' ? 'Verifying subscription…' : 'Continue to secure checkout'}</button>
              <button type="button" disabled={purchaseState === 'processing'} onClick={() => { setSelectedPackage(null); setPurchaseState('idle') }} style={{ minHeight: 44, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 11, background: 'var(--card)', color: 'var(--text)', fontWeight: 750, cursor: purchaseState === 'processing' ? 'not-allowed' : 'pointer' }}>Return to plans</button>
            </div>
          </section>}
          {purchaseState === 'error' && <div role="alert" style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--red-bg)', color: 'var(--red)' }}>
            <p style={{ margin: '0 0 10px' }}>{purchaseError || 'The purchase could not be completed. No subscription has been confirmed.'}</p>
            <button type="button" onClick={() => setPurchaseState('review')} style={{ minHeight: 42, padding: '8px 13px', border: '1px solid currentColor', borderRadius: 10, background: 'transparent', color: 'inherit', fontWeight: 750, cursor: 'pointer' }}>Review and retry</button>
          </div>}
          {purchaseState === 'processing' && <p role="status" aria-live="polite" style={{ color: 'var(--muted)' }}>Waiting for the payment provider and verifying your subscription. Keep this page open.</p>}

          <p style={{ margin: '11px 2px 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>Prices reflect the options available for your account and selected billing period. Final renewal terms and any applicable taxes are shown before payment.</p>
        </section>

        <section aria-labelledby="comparison-heading" style={{ marginTop: 28 }}>
          <h2 id="comparison-heading" style={{ margin: '0 0 10px', color: 'var(--text)', fontSize: 20 }}>Compare features</h2>
          <div className="card comparison-table-wrap" role="region" aria-label="Plan feature comparison, scroll horizontally for all plans" tabIndex={0} style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', color: 'var(--text)', fontSize: 13 }}>
              <thead><tr>
                <th scope="col" style={{ padding: '13px 14px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Feature</th>
                {(['free', ...PAID_PLAN_IDS] as PlanId[]).map(planId => <th key={planId} scope="col" style={{ padding: '13px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{PLANS[planId].displayName}</th>)}
              </tr></thead>
              <tbody>
                {PLAN_COMPARISON_FEATURES.map(row => <tr key={row.id}>
                  <th scope="row" style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{row.label}</th>
                  {(['free', ...PAID_PLAN_IDS] as PlanId[]).map(planId => <td key={planId} style={{ padding: '12px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)', color: featureIncluded(planId, row) ? 'var(--green)' : 'var(--muted)' }}>{featureIncluded(planId, row) ? <span role="img" aria-label="Included">✓</span> : <span role="img" aria-label="Not included">—</span>}</td>)}
                </tr>)}
                <tr>
                  <th scope="row" style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600 }}>AI Coach requests / month</th>
                  {(['free', ...PAID_PLAN_IDS] as PlanId[]).map(planId => {
                    const limit = getAIRequestLimit(getPlanEntitlements(planId))
                    return <td key={planId} style={{ padding: '12px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>{limit === null ? 'Unlimited' : limit}</td>
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ margin: '9px 2px 0', color: 'var(--muted)', fontSize: 11, lineHeight: 1.5 }}>Comparison reflects features and entitlements currently configured in Kayven. Features marked coming soon are intentionally not advertised here.</p>
        </section>

        <section aria-labelledby="billing-history-heading" className="card" style={{ marginTop: 22, padding: 16 }}>
          <h2 id="billing-history-heading" style={{ margin: '0 0 6px', color: 'var(--text)', fontSize: 16 }}>Payment history</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Payment history and invoice links are not available through the current Kayven billing integration. Use the payment provider’s account tools where available.</p>
        </section>
      </div>
      <style jsx global>{`
        .plans-surface button:focus-visible,
        .plans-surface a:focus-visible,
        .plans-surface [tabindex="0"]:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .plans-surface *,
          .plans-surface *::before,
          .plans-surface *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <BottomNav />
    </main>
  )
}
