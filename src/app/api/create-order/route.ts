import Razorpay from 'razorpay'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MINIMUM_AMOUNT_PAISE = 100

export async function POST(request: NextRequest) {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) {
    return NextResponse.json({ error: 'Payment service is not configured.' }, { status: 503 })
  }

  try {
    const { amount, currency, receipt } = await request.json()
    const normalizedAmount = Number(amount)
    const normalizedCurrency = currency ? String(currency).toUpperCase() : 'INR'

    if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount < MINIMUM_AMOUNT_PAISE) {
      return NextResponse.json({ error: `Amount must be at least ${MINIMUM_AMOUNT_PAISE} paise.` }, { status: 400 })
    }

    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      return NextResponse.json({ error: 'Currency must be a three-letter ISO code.' }, { status: 400 })
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await razorpay.orders.create({
      amount: normalizedAmount,
      currency: normalizedCurrency,
      receipt: typeof receipt === 'string' && receipt.trim() ? receipt.trim().slice(0, 40) : `receipt_${Date.now()}`,
    })

    return NextResponse.json({ order_id: order.id, amount: order.amount, currency: order.currency })
  } catch (error: any) {
    const status = error?.statusCode === 401 ? 401 : 500
    return NextResponse.json({ error: status === 401 ? 'Payment service authentication failed.' : 'Unable to create payment order.' }, { status })
  }
}