'use client'

export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Page() {
  const router = useRouter()
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error('[Home] Session check error:', error)
          // Retry with backoff on mobile
          if (retryCount < 3) {
            setTimeout(() => setRetryCount(r => r + 1), 500 * (retryCount + 1))
            return
          }
          router.replace('/auth')
        } else if (data.session) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('onboarding_completed_at')
            .eq('id', data.session.user.id)
            .maybeSingle()
          if (profileError) {
            console.error('[Home] Profile completion check failed', { code: profileError.code || 'unknown' })
            router.replace('/onboarding?next=%2Fdashboard')
          } else {
            router.replace(profile?.onboarding_completed_at ? '/dashboard' : '/onboarding?next=%2Fdashboard')
          }
        } else {
          router.replace('/auth')
        }
      } catch (e) {
        console.error('[Home] Unexpected error:', e)
        if (retryCount < 3) {
          setTimeout(() => setRetryCount(r => r + 1), 500 * (retryCount + 1))
        } else {
          router.replace('/auth')
        }
      }
    }

    checkSession()
  }, [retryCount, router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--surface)' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )
}
