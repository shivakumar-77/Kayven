import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { DEFAULT_RESERVATION_EXPIRY_MINUTES, releaseExpiredAIUsageReservations } from '@/lib/billing/server'

export const dynamic = 'force-dynamic'

const MIN_SECRET_LENGTH = 16

// Accepts AI_CLEANUP_SECRET (any caller) or CRON_SECRET (sent automatically by Vercel Cron).
// Server-side only: neither variable is NEXT_PUBLIC_ and neither is ever returned.
function authorized(req: NextRequest): boolean {
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  return [process.env.AI_CLEANUP_SECRET, process.env.CRON_SECRET].some(secret => {
    if (!secret || secret.length < MIN_SECRET_LENGTH) return false
    const expected = Buffer.from(`Bearer ${secret}`)
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const configured = Number(process.env.AI_RESERVATION_EXPIRY_MINUTES)
  try {
    // Thresholds below the safety floor are rejected by the helper and the SQL function (fail closed).
    const released = await releaseExpiredAIUsageReservations({
      olderThanMinutes: Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RESERVATION_EXPIRY_MINUTES,
    })
    console.info(`[AI reservation cleanup] released=${released}`)
    return NextResponse.json({ released })
  } catch (error) {
    console.error('[AI reservation cleanup] failed', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

// Vercel Cron issues GET requests; POST is kept for manual or other schedulers.
export const GET = handle
export const POST = handle
