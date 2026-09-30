import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/log', '/profile', '/progress', '/water', '/calories', '/bmi', '/calorie-calc']
const RAZORPAY_PAYMENT_ROUTES = ['/api/create-order', '/api/verify-payment']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next()

  // Security headers on every response
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=self, microphone=(), geolocation=()')
  response.headers.set('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://world.openfoodfacts.org https://accounts.google.com https://www.googleapis.com https://*.razorpay.com; " +
    "media-src 'self' blob:; " +
    "frame-src https://checkout.razorpay.com https://api.razorpay.com; " +
    "frame-ancestors 'none'; " +
    "form-action 'self' https://accounts.google.com https://*.supabase.co;"
  )
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  // Check auth for protected routes
  const authToken =
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get('sb-refresh-token')?.value ||
    Array.from(request.cookies.getAll())
      .find(c => c.name.includes('supabase-auth') || c.name.includes('sb-'))
      ?.value

  if (PROTECTED.some(p => pathname.startsWith(p)) && !authToken) {
    console.log(`[Middleware] No auth token for protected route: ${pathname}`)
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  // India geo-restriction for Razorpay payment routes
  if (RAZORPAY_PAYMENT_ROUTES.some(route => pathname.startsWith(route))) {
    // For now, we'll allow the request to proceed and handle validation in the API route itself
    // A more sophisticated implementation would check user's country/profile here
    // Since we don't have country in profile yet, we'll rely on frontend validation and API-level checks
    console.log(`[Middleware] Razorpay payment route accessed: ${pathname}`)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
