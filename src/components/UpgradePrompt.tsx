'use client'

import type { PlanId } from '@/lib/billing/plans'
import { useRouter } from 'next/navigation'
import { LockIcon } from '@/lib/icons'

interface UpgradePromptProps {
  title?: string
  message?: string
  suggestedPlan?: Exclude<PlanId, 'free'>
  context?: 'ai_limit' | 'feature_locked' | 'billing_unavailable'
}

export default function UpgradePrompt({
  title = 'Unlock more with KAYVEN',
  message = 'This feature is available on a paid KAYVEN plan.',
  suggestedPlan = 'basic',
  context = 'feature_locked',
}: UpgradePromptProps) {
  const router = useRouter()
  const defaultTitle = context === 'ai_limit' ? 'AI Coach limit reached' : context === 'billing_unavailable' ? 'Billing is not available yet' : title
  const defaultMessage = context === 'ai_limit' ? 'Your current plan has used its AI Coach allowance for this period.' : message

  return (
    <section role="status" aria-live="polite" style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 16, background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LockIcon size={16} color="var(--primary)" /><strong>{defaultTitle}</strong></div>
      <p style={{ margin: '8px 0 12px', color: 'var(--muted)' }}>{defaultMessage}</p>
      <button type="button" onClick={() => router.push('/subscription')} title={`View ${suggestedPlan} plan`}>
        View plans
      </button>
    </section>
  )
}
