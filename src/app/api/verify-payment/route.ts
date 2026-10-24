import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  return NextResponse.json(
    { error: 'Payment verification is disabled because subscription checkout is not available.' },
    { status: 410 },
  )
}
