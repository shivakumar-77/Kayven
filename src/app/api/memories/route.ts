import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import {
  clearUserMemories,
  deleteMemory,
  deactivateMemory,
  getRelevantMemories,
} from '@/lib/server/kayven-memory'
import { RateLimiterMemory } from 'rate-limiter-flexible'

// Rate limiter for memories: 10 requests per 10 seconds per IP
const memoriesRateLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 10, // per 10 seconds
})

export const dynamic = 'force-dynamic'

async function getAuthenticatedUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { supabase, user: null }
  }

  return { supabase, user }
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Please sign in to manage KAYVEN memory.' }, { status: 401 })
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.socket.remoteAddress || 'anonymous'
  try {
    await memoriesRateLimiter.consume(ip)
  } catch (err) {
    return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 })
  }

  const memories = await getRelevantMemories(supabase, user.id, { limit: 50 })
  return NextResponse.json({ memories })
}

export async function PATCH(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Please sign in to manage KAYVEN memory.' }, { status: 401 })
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.socket.remoteAddress || 'anonymous'
  try {
    await memoriesRateLimiter.consume(ip)
  } catch (err) {
    return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const memoryId = typeof body?.memoryId === 'string' ? body.memoryId : ''

  if (!memoryId) {
    return NextResponse.json({ error: 'memoryId is required.' }, { status: 400 })
  }

  const deactivated = await deactivateMemory(supabase, user.id, memoryId)
  return deactivated
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Memory not found or could not be updated.' }, { status: 404 })
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Please sign in to manage KAYVEN memory.' }, { status: 401 })
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.socket.remoteAddress || 'anonymous'
  try {
    await memoriesRateLimiter.consume(ip)
  } catch (err) {
    return NextResponse.json({ error: 'Too many requests, please try again later.' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const memoryId = typeof body?.memoryId === 'string' ? body.memoryId : ''

  if (body?.clearAll === true) {
    const cleared = await clearUserMemories(supabase, user.id)
    return cleared
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Memories could not be cleared.' }, { status: 500 })
  }

  if (!memoryId) {
    return NextResponse.json({ error: 'memoryId or clearAll is required.' }, { status: 400 })
  }

  const deleted = await deleteMemory(supabase, user.id, memoryId)
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Memory not found or could not be deleted.' }, { status: 404 })
}
