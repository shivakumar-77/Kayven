import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  return NextResponse.json(
    { error: 'One-time payment orders are disabled. Subscription checkout is not available.' },
    { status: 410 },
  )
}
