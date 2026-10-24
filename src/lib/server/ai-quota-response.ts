import { NextResponse } from 'next/server'
import { entitlementDeniedPayload, type MeteredAIOutcome } from '@/lib/billing/server'

export function meteredAIFailureResponse(outcome: Exclude<MeteredAIOutcome<unknown>, { status: 'ok' }>): NextResponse {
  if (outcome.status === 'feature_denied') {
    return NextResponse.json(entitlementDeniedPayload(outcome.check), { status: 403 })
  }
  if (outcome.status === 'limit_reached') {
    return NextResponse.json({
      error: 'AI_USAGE_LIMIT_REACHED',
      message: 'You have reached your AI limit for this period.',
      upgradeRequired: true,
      planId: outcome.planId,
      aiUsage: outcome.usage,
      aiLimit: outcome.limit,
      suggestedPlan: outcome.suggestedPlan,
    }, { status: 429 })
  }
  if (outcome.status === 'duplicate') {
    return NextResponse.json({
      error: 'AI_REQUEST_ALREADY_HANDLED',
      message: 'This request was already accepted or completed. Reuse a new request key only to intentionally start a new operation.',
    }, { status: 409 })
  }
  if (outcome.status === 'throttled') {
    return NextResponse.json({
      error: 'AI_REQUEST_THROTTLED',
      message: outcome.reason === 'in_progress'
        ? 'An AI request is already in progress. Please wait for it to finish.'
        : 'Too many recent AI requests failed. Please try again later.',
    }, { status: 429, headers: { 'Retry-After': String(outcome.retryAfterSeconds) } })
  }
  return NextResponse.json({
    error: 'AI_USAGE_UNAVAILABLE',
    message: 'AI features are temporarily unavailable because usage limits could not be verified.',
  }, { status: 503 })
}
