import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isMissingOnboardingSchema, safeReturnPath } from '@/lib/onboarding'

export async function GET(req) {
  const { searchParams, origin } = new URL(req.url)
  const requestedNext = safeReturnPath(searchParams.get('next'))
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('[Auth Callback] OAuth error:', error, errorDescription)
    const params = new URLSearchParams({
      error: error,
      description: errorDescription || 'OAuth failed'
    })
    const redirectUrl = new URL(`${origin}/auth`)
    redirectUrl.search = params.toString()
    console.log('[Auth Callback] Redirecting to auth with error:', redirectUrl.href)
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    console.error('[Auth Callback] No authorization code received')
    const params = new URLSearchParams({
      error: 'no_code',
      description: 'Authorization code not found'
    })
    return NextResponse.redirect(new URL(`${origin}/auth?${params.toString()}`))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => {
          console.log('[Auth Callback] Setting cookie:', name)
          return cookieStore.set({ name, value, ...options })
        },
        remove: (name, options) => {
          console.log('[Auth Callback] Removing cookie:', name)
          return cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  try {
    console.log('[Auth Callback] Exchanging code for session...')
    const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('[Auth Callback] Session exchange error:', exchangeError)
      const params = new URLSearchParams({
        error: 'session_exchange_failed',
        description: exchangeError.message || 'Failed to establish session'
      })
      return NextResponse.redirect(new URL(`${origin}/auth?${params.toString()}`))
    }
    
    if (data.session) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', data.session.user.id)
        .maybeSingle()
      if (profileError) {
        console.error('[Auth Callback] Profile completion check failed', { code: profileError.code || 'unknown' })
        const errorCode = isMissingOnboardingSchema(profileError) ? 'profile_schema_missing' : 'profile_check_failed'
        return NextResponse.redirect(new URL(`${origin}/auth?error=${errorCode}`))
      }
      const destination = profile?.onboarding_completed_at
        ? (requestedNext && requestedNext !== '/onboarding' ? requestedNext : '/dashboard')
        : `/onboarding?next=${encodeURIComponent(requestedNext && requestedNext !== '/onboarding' ? requestedNext : '/dashboard')}`
      return NextResponse.redirect(new URL(destination, origin))
    } else {
      console.warn('[Auth Callback] Code exchanged but no session returned')
      const params = new URLSearchParams({
        error: 'no_session',
        description: 'Session establishment failed'
      })
      return NextResponse.redirect(new URL(`${origin}/auth?${params.toString()}`))
    }
  } catch (e) {
    console.error('[Auth Callback] Unexpected error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error occurred'
    const params = new URLSearchParams({
      error: 'callback_error',
      description: message
    })
    return NextResponse.redirect(new URL(`${origin}/auth?${params.toString()}`))
  }
}
