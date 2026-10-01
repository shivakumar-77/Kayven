'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import BottomNav from '../../components/BottomNav'
import PageHeader from '../../components/PageHeader'
import { PLANS, type PlanId } from '../../lib/billing/plans'
import { getRazorpayPlanConfig, type RazorpayPlanConfig, type BillingPeriod } from '../../lib/billing/razorpay-config'

const PLAN_ORDER: PlanId[] = ['basic', 'standard', 'pro']

export default function SubscriptionPage() {
  const router = useRouter()
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [isMounted, setIsMounted] = useState(false)

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
    razorpayLink: string
    effectiveMonthly: number
  } => {
    const config = getRazorpayPlanConfig(planId, billingPeriod)
    if (!config) {
      // Fallback for free plan or missing config
      return {
        mrp: 0,
        offerPrice: 0,
        savingsPercent: 0,
        savingsAmount: 0,
        razorpayLink: '#',
        effectiveMonthly: 0
      }
    }
    
    const mrp = config.mrp || 0
    const offerPrice = config.offerPrice || 0
    const savingsAmount = mrp - offerPrice
    const savingsPercent = mrp > 0 ? Math.round((savingsAmount / mrp) * 100) : 0
    const effectiveMonthly = billingPeriod === 'yearly' ? offerPrice / 12 : offerPrice
    
    return {
      mrp,
      offerPrice,
      savingsPercent,
      savingsAmount,
      razorpayLink: config.razorpaySubscriptionLink || '#',
      effectiveMonthly
    }
  }

  // Get plan details
  const getPlanDetails = (planId: PlanId) => {
    const plan = PLANS[planId]
    const priceInfo = getPlanPriceInfo(planId)
    
    // Define feature sets based on plan
    const featuresByPlan: Record<PlanId, string[]> = {
      free: [
        'Core nutrition tracking',
        'Basic fitness tracking',
        'Goal setting',
        'Limited AI Coach requests'
      ],
      basic: [
        'Food tracking',
        'Basic nutrition insights',
        'AI Coach',
        'Meal planning',
        'Workout planning',
        'Progress tracking'
      ],
      standard: [
        'Everything in Basic',
        'Advanced nutrition insights',
        'AI Coach (advanced)',
        'Personalized meal planning',
        'Advanced workout plans',
        'Progress analytics'
      ],
      premium: [
        'Expanded AI Coach',
        'Advanced health intelligence',
        'Legacy features'
      ],
      pro: [
        'Everything in Standard',
        'Custom AI recommendations',
        'Performance tracking',
        'Priority support',
        '1:1 AI health coach — Coming soon'
      ]
    }
    
    return {
      ...plan,
      priceInfo,
      features: featuresByPlan[planId] || []
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
              Personalized nutrition, workouts, progress tracking and AI coaching — all in one place.
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
            gridTemplateColumns: billingPeriod === 'yearly' && typeof window !== 'undefined' && window.innerWidth >= 768 ? 'repeat(3, 1fr)' : 'repeat(auto-fit, minmax(100%, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {PLAN_ORDER.map((planId) => {
              const plan = getPlanDetails(planId)
              const isMostPopular = planId === 'standard'
              
              return (
                <div 
                  key={planId} 
                  style={{ 
                    background: 'white',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                    border: isMostPopular ? '2px solid #0f5132' : '1px solid #e0e0e0',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Badge */}
                  {planId === 'basic' && (
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
                      40% OFF
                    </div>
                  )}
                  {planId === 'standard' && (
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
                      MOST POPULAR
                    </div>
                  )}
                  {planId === 'pro' && (
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
                      30% OFF
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
                        {plan.priceInfo.mrp > 0 && (
                          <div style={{ 
                            textDecoration: 'line-through', 
                            color: '#999', 
                            fontSize: '16px',
                            marginBottom: '4px'
                          }}>
                            ₹{plan.priceInfo.mrp.toLocaleString()}
                          </div>
                        )}
                        <div style={{ 
                          fontSize: '28px', 
                          fontWeight: '700', 
                          color: '#0f5132',
                          lineHeight: '1'
                        }}>
                          ₹{plan.priceInfo.offerPrice.toLocaleString()}
                        </div>
                        <div style={{ 
                          fontSize: '14px', 
                          color: '#666',
                          marginTop: '4px'
                        }}>
                          {billingPeriod === 'monthly' ? '/month' : '/year'}
                        </div>
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
                    {billingPeriod === 'yearly' && (
                      <div style={{ 
                        fontSize: '13px', 
                        color: '#666',
                        textAlign: 'center',
                        marginBottom: '16px'
                      }}>
                        Effective ₹{plan.priceInfo.effectiveMonthly.toLocaleString()}/month
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
                      onClick={() => {
                        window.open(plan.priceInfo.razorpayLink, '_blank', 'noopener')
                      }}
                      style={{ 
                        width: '100%',
                        padding: '14px',
                        borderRadius: '12px',
                        fontSize: '16px',
                        fontWeight: '600',
                        border: 'none',
                        background: '#0f5132',
                        color: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}
                    >
                      Get Started →
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
              <span>✓ Secure payments via Razorpay</span>
              <span>✓ Cancel anytime</span>
              <span>✓ Your health data stays private</span>
              <span>✓ AI-powered personalization</span>
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
              Subscriptions renew according to your selected billing period unless cancelled.
            </p>
            <div>
              <a href="/terms" style={{ 
                color: '#666', 
                textDecoration: 'none', 
                margin: '0 8px'
              }}>
                Terms
              </a>
              <span style={{ color: '#ccc', margin: '0 4px' }}>·</span>
              <a href="/privacy" style={{ 
                color: '#666', 
                textDecoration: 'none', 
                margin: '0 8px'
              }}>
                Privacy
              </a>
              <span style={{ color: '#ccc', margin: '0 4px' }}>·</span>
              <a href="/refunds" style={{ 
                color: '#666', 
                textDecoration: 'none', 
                margin: '0 8px'
              }}>
                Refunds
              </a>
              <span style={{ color: '#ccc', margin: '0 4px' }}>·</span>
              <a href="/cancellation" style={{ 
                color: '#666', 
                textDecoration: 'none', 
                margin: '0 8px'
              }}>
                Cancellation
              </a>
            </div>
          </div>
        </section>

        {/* Bottom Navigation */}
        <BottomNav />
      </main>
    </>
    );
}
