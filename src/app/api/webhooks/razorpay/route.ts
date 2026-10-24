import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    { error: 'Razorpay billing is disabled until an account-linked subscription flow is verified.' },
    { status: 410 },
  )
}
