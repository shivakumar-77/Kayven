'use client'

export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isMissingOnboardingSchema, safeReturnPath } from '@/lib/onboarding'

const ONBOARDING_SCHEMA_ERROR = 'Your account is signed in, but onboarding setup is incomplete in the configured Supabase project. Apply migration 20261024000000_onboarding_profile_state.sql, then try again.'

export default function AuthPage() {
  const router = useRouter()
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const requestedNextPath = useCallback(() => {
    return typeof window === 'undefined' ? null : safeReturnPath(new URLSearchParams(window.location.search).get('next'))
  }, [])

  const routeAuthenticatedUser = useCallback(async (userId: string) => {
    const { data: profile, error } = await supabase.from('profiles').select('onboarding_completed_at').eq('id', userId).maybeSingle()
    if (error) {
      console.error('[Auth] Profile completion check failed', { code: error.code || 'unknown' })
      setError(isMissingOnboardingSchema(error)
        ? ONBOARDING_SCHEMA_ERROR
        : 'You are signed in, but we could not load your profile. Please retry.')
      setLoading(false)
      return
    }
    const next = requestedNextPath()
    if (profile?.onboarding_completed_at) {
      router.replace(next && next !== '/onboarding' ? next : '/dashboard')
      return
    }
    const continuation = next && next !== '/onboarding' ? next : '/dashboard'
    router.replace(`/onboarding?next=${encodeURIComponent(continuation)}`)
  }, [requestedNextPath, router])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('mode') === 'signup') setTab('signup')
    const errorParam = searchParams.get('error')
    const errorDesc = searchParams.get('description')
    if (errorParam) {
      console.error('[Auth] OAuth callback error:', { error: errorParam, description: errorDesc })
      setError(errorParam === 'profile_schema_missing'
        ? ONBOARDING_SCHEMA_ERROR
        : errorDesc || `Login failed: ${errorParam}`)
    }

    // Add delay for mobile to ensure cookies are set
    const sessionCheck = setTimeout(async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.warn('[Auth] Session check error:', error)
        }
        if (data?.session) {
          void routeAuthenticatedUser(data.session.user.id)
        } else {
          console.log('[Auth] No session found, staying on auth page')
        }
      } catch (e) {
        console.error('[Auth] Session check failed:', e)
      }
    }, 300)

    return () => clearTimeout(sessionCheck)
  }, [routeAuthenticatedUser])

  async function signInGoogle() {
    setLoading(true)
    setError('')
    console.log('[Auth] Starting Google OAuth flow from:', window.location.origin)
    try {
      const next = requestedNextPath()
      const callbackPath = next ? `/auth/callback?next=${encodeURIComponent(next)}` : '/auth/callback'
      const redirectUrl = `${window.location.origin}${callbackPath}`
      console.log('[Auth] OAuth redirect URL:', redirectUrl)
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { 
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
        }
      })
      
      if (error) {
        const errorMsg = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error))
        setError(errorMsg || 'Google login failed. Please check your Supabase configuration.')
        console.error('[Auth] Google OAuth error:', error)
        setLoading(false)
      } else if (data) {
        console.log('[Auth] OAuth initiated, browser should redirect...')
        // Browser will handle redirect, don't set loading to false
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred'
      setError(message)
      console.error('[Auth] Google login error:', e)
      setLoading(false)
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        console.log('[Auth] Attempting login for:', email)
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          console.error('[Auth] Login error:', error)
          setError(error.message || 'Login failed. Please try again.')
          setLoading(false)
          return
        }
        if (data.session) {
          console.log('[Auth] Login successful, redirecting to dashboard')
          // Add small delay for mobile to process cookies
          setTimeout(() => void routeAuthenticatedUser(data.session.user.id), 100)
        } else {
          console.warn('[Auth] Login succeeded but no session returned')
          setError('No session returned. Please try again.')
          setLoading(false)
        }
      } else {
        console.log('[Auth] Attempting signup for:', email)
        const next = requestedNextPath()
        const emailRedirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo }
        })
        if (error) {
          console.error('[Auth] Signup error:', error)
          setError(error.message || 'Signup failed. Please try again.')
          setLoading(false)
          return
        }
        console.log('[Auth] Signup successful, showing confirmation screen')
        setConfirmed(true)
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'An unexpected error occurred'
      setError(errorMsg)
      console.error('[Auth] Unexpected error:', e)
      setLoading(false)
    }
  }

  if (confirmed) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--surface)' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ width: 72, height: 72, background: 'var(--primary-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>📬</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Check your email</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{email}</strong>. Click it to activate your account.</p>
        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setConfirmed(false)}>Back to login</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* Top brand area */}
      <div style={{ padding: '48px 24px 32px', textAlign: 'center' }}>
        <img src="/Kayven.PNG" alt="Kayven logo" style={{ width: 56, height: 56, borderRadius: 18, display: 'block', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }} />
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>Kayven</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>Smart nutrition, effortless tracking</p>
      </div>

      <div style={{ flex: 1, padding: '0 20px 40px', maxWidth: 430, width: '100%', margin: '0 auto' }}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--card2)', borderRadius: 14, padding: 4, marginBottom: 24, border: '1.5px solid var(--border)' }}>
          {['login', 'signup'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              style={{ flex: 1, padding: '10px', borderRadius: 11, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                background: tab === t ? 'var(--primary)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--muted)',
                boxShadow: tab === t ? '0 2px 8px rgba(99,102,241,0.3)' : 'none'
              }}>
              {t === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {tab === 'signup' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</label>
              <input placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
            <input type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          {error && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>{error}</div>
          )}
          <button className="btn btn-primary pulse-primary" type="submit" disabled={loading} style={{ marginTop: 4, padding: '15px', fontSize: 15 }}>
            {loading ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button className="btn btn-ghost" style={{ width: '100%', padding: '14px' }} onClick={signInGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 24, lineHeight: 1.6 }}>
          By continuing you agree to our Terms & Privacy Policy
        </p>
      </div>
    </div>
  )
}
