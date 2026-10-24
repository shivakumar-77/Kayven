// Best-effort, per-server-instance protection against failure-cost abuse.
// State is in memory: it is NOT shared across serverless instances or restarts, so it
// limits accidental repeats and single-instance abuse, not a distributed attacker.
export const MAX_RECENT_FAILURES = 5
export const FAILURE_WINDOW_MS = 10 * 60 * 1000

export type AIGuardDecision =
  | { allowed: true; finish: (countAsFailure: boolean) => void }
  | { allowed: false; reason: 'in_progress' | 'cooldown'; retryAfterSeconds: number }

export class AIAbuseGuard {
  private inFlight = new Set<string>()
  private failures = new Map<string, number[]>()

  constructor(private now: () => number = Date.now) {}

  begin(userId: string): AIGuardDecision {
    const recent = this.recentFailures(userId)
    if (recent.length >= MAX_RECENT_FAILURES) {
      const retryAfterMs = recent[0] + FAILURE_WINDOW_MS - this.now()
      return { allowed: false, reason: 'cooldown', retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
    }
    if (this.inFlight.has(userId)) return { allowed: false, reason: 'in_progress', retryAfterSeconds: 5 }

    this.inFlight.add(userId)
    let finished = false
    return {
      allowed: true,
      finish: (countAsFailure: boolean) => {
        if (finished) return
        finished = true
        this.inFlight.delete(userId)
        if (countAsFailure) this.failures.set(userId, [...this.recentFailures(userId), this.now()])
      },
    }
  }

  reset(): void {
    this.inFlight.clear()
    this.failures.clear()
  }

  private recentFailures(userId: string): number[] {
    const cutoff = this.now() - FAILURE_WINDOW_MS
    const recent = (this.failures.get(userId) ?? []).filter(time => time > cutoff)
    if (recent.length) this.failures.set(userId, recent)
    else this.failures.delete(userId)
    return recent
  }
}

export const aiAbuseGuard = new AIAbuseGuard()
