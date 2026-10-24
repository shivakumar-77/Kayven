'use client'

import { useState, useEffect } from 'react'
import BottomNav from '../../components/BottomNav'
import PageHeader from '../../components/PageHeader'
import { PLANS, type PlanId } from '../../lib/billing/plans'
import { getRazorpayPlanConfig, type BillingPeriod } from '../../lib/billing/razorpay-config'
import { canUseFeature, ENTITLEMENT_DEFINITIONS, getAIRequestLimit, getPlanEntitlements, type EntitlementId } from '../../lib/billing/entitlements'
import { useSubscription } from '../../lib/billing/client'

const PLAN_ORDER: PlanId[] = Object.values(PLANS).filter(plan => plan.active).map(plan => plan.id)

export default function SubscriptionPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [isMounted, setIsMounted] = useState(false)
  const { state: subscriptionState } = useSubscription()
  const visiblePlans = subscriptionState?.statusUnavailable !== true
    && subscriptionState?.currentPlan
    && !PLAN_ORDER.includes(subscriptionState.currentPlan)
    ? [subscriptionState.currentPlan, ...PLAN_ORDER]
    : PLAN_ORDER

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Handle billing period change
  const handleBillingPeriodChange = (period: BillingPeriod) => {
    setBillingPeriod(period)
  }

  // Get plan config for billing period
  const getPlanPriceInfo = (planId: PlanId): {
    mrp: number
    offerPrice: number
    savingsPercent: number
    savingsAmount: number
    effectiveMonthly: number
    pricingAvailable: boolean
  } => {
    const config = getRazorpayPlanConfig(planId, billingPeriod)
    if (!config) {
      return {
        mrp: 0,
        offerPrice: 0,
        savingsPercent: 0,
        savingsAmount: 0,
        effectiveMonthly: 0,
        pricingAvailable: false,
      }
    }
    
    const mrp = config.mrp
    const offerPrice = config.offerPrice
    const savingsAmount = config.discountAmount
    const savingsPercent = config.displayDiscountPercentage
    const effectiveMonthly = billingPeriod === 'yearly' ? offerPrice / 12 : offerPrice
    
    return {
      mrp,
      offerPrice,
      savingsPercent,
      savingsAmount,
      effectiveMonthly,
      pricingAvailable: true,
    }
  }

  const getPlanDetails = (planId: PlanId) => {
    const plan = PLANS[planId]
    const priceInfo = getPlanPriceInfo(planId)
    const entitlements = getPlanEntitlements(planId)
    const features = (Object.entries(ENTITLEMENT_DEFINITIONS) as Array<[EntitlementId, typeof ENTITLEMENT_DEFINITIONS[EntitlementId]]>)
      .filter(([feature, definition]) => feature !== 'ai_coach' && definition.availability === 'available' && canUseFeature(entitlements, feature))
      .map(([, definition]) => definition.label)
    const aiLimit = getAIRequestLimit(entitlements)
    features.unshift(aiLimit === null ? 'AI Coach: unlimited requests' : `AI Coach: ${aiLimit} requests per month`)

    return {
      ...plan,
      priceInfo,
      features,
    }
  }

  if (isMounted === false) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--surface)' }}>
        <PageHeader title="Plans" href="/dashboard" />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: 'var(--muted)' }}>
          Loading plans...
        </div>
        <BottomNav />
      </main>
    )
  }

  return (
    <>
      {/* Main content with padding for bottom nav */}
      <main 
        style={{ 
          minHeight: '100dvh', 
          background: 'var(--surface)', 
          paddingBottom: '20px' 
        }}
      >
        {/* Premium Pricing Hero */}
        <section style={{ 
          background: 'linear-gradient(135deg, #0f5132 0%, #1a5f42 100%)', 
          color: 'white',
          padding: '24px 16px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ 
            maxWidth: 900, 
            margin: '0 auto',
            position: 'relative',
            zIndex: 2
          }}>
            {/* Eyebrow */}
            <p style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              opacity: '0.9',
              marginBottom: '8px'
            }}>
              KAYVEN PLANS
            </p>
            
            {/* Headline */}
            <h1 style={{ 
              fontSize: '28px', 
              fontWeight: '700', 
              margin: '0 0 12px 0',
              lineHeight: '1.2'
            }}>
              Better Nutrition. Stronger You.
            </h1>
            
            {/* Supporting text */}
            <p style={{ 
              fontSize: '16px', 
              opacity: '0.9',
              marginBottom: '16px',
              maxWidth: '600px',
              marginLeft: 'auto',
              marginRight: 'auto'
            }}>
              Track nutrition, hydration, body measurements, and workouts, with AI Coach guidance within your plan limit.
            </p>
            
            {/* Secondary text */}
            <p style={{ 
              fontSize: '14px', 
              opacity: '0.8',
              marginBottom: '20px'
            }}>
              Choose the plan that fits your goals.
            </p>
            
            {/* Billing toggle */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '8px',
              borderRadius: '50px'
            }}>
              <button
                type="button"
                onClick={() => handleBillingPeriodChange('monthly')}
                disabled={billingPeriod === 'monthly'}
                style={{ 
                  padding: '8px 16px',
                  borderRadius: '25px',
                  fontSize: '14px',
                  fontWeight: '600',
                  border: 'none',
                  background: billingPeriod === 'monthly' ? 'white' : 'transparent',
                  color: billingPeriod === 'monthly' ? '#0f5132' : 'rgba(255, 255, 255, 0.8)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                MONTHLY
              </button>
              <span style={{ 
                width: '1px', 
                height: '20px', 
                background: 'rgba(255, 255, 255, 0.2)' 
              }} />
              <button
                type="button"
                onClick={() => handleBillingPeriodChange('yearly')}
                disabled={billingPeriod === 'yearly'}
                style={{ 
                  padding: '8px 16px',
                  borderRadius: '25px',
                  fontSize: '14px',
                  fontWeight: '600',
                  border: 'none',
                  background: billingPeriod === 'yearly' ? 'white' : 'transparent',
                  color: billingPeriod === 'yearly' ? '#0f5132' : 'rgba(255, 255, 255, 0.8)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                YEARLY
                <span style={{ 
                  marginLeft: '4px',
                  fontSize: '12px',
                  opacity: '0.8'
                }}>
                  SAVE UP TO 43%
                </span>
              </button>
            </div>
          </div>
        </section>
        
        {/* Plans Container */}
        <section style={{ 
          maxWidth: 900, 
          margin: '0 auto', 
          padding: '24px 16px' 
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {visiblePlans.map((planId) => {
              const plan = getPlanDetails(planId)
              const isCurrentPlan = subscriptionState?.currentPlan === planId && subscriptionState.statusUnavailable !== true
              
              return (
                <div 
                  key={planId} 
                  style={{ 
                    background: 'white',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                    border: '1px solid #e0e0e0',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Badge */}
                  {plan.priceInfo.savingsPercent > 0 && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '16px', 
                      left: '16px',
                      background: '#0f5132',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      zIndex: 2
                    }}>
                      SAVE {plan.priceInfo.savingsPercent}%
                    </div>
                  )}
                  {isCurrentPlan && (
                    <div style={{ position: 'absolute', top: 16, right: 16, color: '#0f5132', fontSize: 12, fontWeight: 600 }}>
                      CURRENT PLAN
                    </div>
                  )}
                  
                  {/* Plan content */}
                  <div style={{ 
                    flex: '1', 
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {/* Header */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'flex-start',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <h2 style={{ 
                          margin: '0 0 4px 0', 
                          fontSize: '20px', 
                          fontWeight: '600',
                          color: '#0f5132'
                        }}>
                          {plan.displayName}
                        </h2>
                        <p style={{ 
                          margin: '0', 
                          fontSize: '14px', 
                          color: '#666',
                          fontWeight: '500'
                        }}>
                          {plan.description}
                        </p>
                      </div>
                      
                      {/* Price */}
                      <div style={{ 
                        textAlign: 'right',
                        flexShrink: 0
                      }}>
                        {!plan.priceInfo.pricingAvailable ? (
                          <div style={{ color: '#666', fontSize: 14 }}>Pricing unavailable</div>
                        ) : plan.priceInfo.mrp > 0 && (
                          <div style={{ 
                            textDecoration: 'line-through', 
                            color: '#999', 
                            fontSize: '16px',
                            marginBottom: '4px'
                          }}>
                            ₹{plan.priceInfo.mrp.toLocaleString()}
                          </div>
                        )}
                        {plan.priceInfo.pricingAvailable && <div style={{
                          fontSize: '28px', 
                          fontWeight: '700', 
                          color: '#0f5132',
                          lineHeight: '1'
                        }}>
                          ₹{plan.priceInfo.offerPrice.toLocaleString()}
                        </div>}
                        {plan.priceInfo.pricingAvailable && plan.priceInfo.offerPrice > 0 && <div style={{
                          fontSize: '14px', 
                          color: '#666',
                          marginTop: '4px'
                        }}>
                          {billingPeriod === 'monthly' ? '/month' : '/year'}
                        </div>}
                      </div>
                    </div>
                    
                    {/* Savings info */}
                    {plan.priceInfo.savingsAmount > 0 && (
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '16px',
                        padding: '8px 0',
                        borderTop: '1px solid #f0f0f0',
                        borderBottom: '1px solid #f0f0f0'
                      }}>
                        <span style={{ 
                          fontSize: '14px', 
                          fontWeight: '600',
                          color: '#0f5132'
                        }}>
                          Save ₹{plan.priceInfo.savingsAmount.toLocaleString()}
                        </span>
                        <span style={{ 
                          background: '#d4edda', 
                          color: '#155724',
                          fontSize: '12px',
                          fontWeight: '500',
                          padding: '2px 8px',
                          borderRadius: '12px'
                        }}>
                          {plan.priceInfo.savingsPercent}%
                        </span>
                      </div>
                    )}
                    
                    {/* Effective monthly price (yearly only) */}
                    {plan.priceInfo.pricingAvailable && plan.priceInfo.offerPrice > 0 && billingPeriod === 'yearly' && (
                      <div style={{ 
                        fontSize: '13px', 
                        color: '#666',
                        textAlign: 'center',
                        marginBottom: '16px'
                      }}>
                        Effective ₹{plan.priceInfo.effectiveMonthly.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/month
                      </div>
                    )}
                    
                    {/* Features */}
                    <div style={{ 
                      flex: '1',
                      marginBottom: '20px'
                    }}>
                      {plan.features.map((feature, index) => (
                        <div 
                          key={index} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'flex-start', 
                            marginBottom: '8px',
                            fontSize: '14px',
                            color: '#333'
                          }}
                        >
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            width: '20px',
                            height: '20px',
                            marginRight: '8px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#0f5132',
                            background: '#e8f5e9',
                            borderRadius: '4px'
                          }}>
                            ✓
                          </span>
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                    
                    {/* CTA Button */}
                    <button
                      type="button"
                      disabled
                      aria-label={isCurrentPlan ? `${plan.displayName} is your current plan` : 'Subscription checkout is unavailable'}
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '12px',
                        fontSize: '16px',
                        fontWeight: '600',
                        border: '1px solid #d5d5d5',
                        background: '#f5f5f5',
                        color: '#666',
                        cursor: 'not-allowed',
                      }}
                    >
                      {isCurrentPlan ? 'Current plan' : 'Checkout unavailable'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          
          {/* Value Strip */}
          <div style={{ 
            background: '#f8f9fa',
            borderRadius: '12px',
            padding: '16px',
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              justifyContent: 'center', 
              gap: '12px',
              fontSize: '13px',
              color: '#666'
            }}>
              <span>Plan prices and features are shown as currently configured</span>
              <span>Subscription purchase is not available yet</span>
            </div>
          </div>
          
          {/* Subscription Disclosure */}
          <div style={{ 
            textAlign: 'center', 
            padding: '20px 16px',
            color: '#666',
            fontSize: '13px'
          }}>
            <p style={{ 
              margin: '0 0 8px 0',
              lineHeight: '1.5'
            }}>
              Prices are informational. Checkout and free trials are unavailable until the subscription provider and terms are verified.
            </p>
            <p style={{ margin: 0 }}>Review existing Terms and Privacy information from Account &gt; About.</p>
          </div>
        </section>

        {/* Bottom Navigation */}
        <BottomNav />
      </main>
    </>
    );
}
