const CACHE_PREFIX = 'kayven:dashboard:v1'
export const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000

export interface DashboardSnapshot {
  profile: {
    id: string
    name: string | null
    photo_url: string | null
    cal_target: number | null
    protein_target: number | null
    carb_target: number | null
    fat_target: number | null
    fiber_target: number | null
    water_goal: number | null
  } | null
  logs: Array<Record<string, unknown>>
  waterMl: number
  savedAt: number
}

function keyFor(userId: string, day: string): string {
  return `${CACHE_PREFIX}:${userId}:${day}`
}

export function readDashboardSnapshot(userId: string, day: string): DashboardSnapshot | null {
  try {
    const key = keyFor(userId, day)
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null

    const snapshot = JSON.parse(raw) as DashboardSnapshot
    if (
      snapshot.profile?.id !== userId ||
      !Array.isArray(snapshot.logs) ||
      !Number.isFinite(snapshot.waterMl) ||
      !Number.isFinite(snapshot.savedAt) ||
      snapshot.savedAt > Date.now() ||
      Date.now() - snapshot.savedAt > DASHBOARD_CACHE_TTL_MS
    ) {
      window.sessionStorage.removeItem(key)
      return null
    }
    return snapshot
  } catch {
    console.warn('[Dashboard] Session cache unavailable; loading fresh data')
    return null
  }
}

export function writeDashboardSnapshot(
  userId: string,
  day: string,
  snapshot: Omit<DashboardSnapshot, 'savedAt'>
): void {
  try {
    const safeProfile = snapshot.profile && {
      ...snapshot.profile,
      // Avoid persisting inline image data or unusually large photo payloads.
      photo_url: snapshot.profile.photo_url?.startsWith('data:') || (snapshot.profile.photo_url?.length ?? 0) > 2048
        ? null
        : snapshot.profile.photo_url,
    }
    window.sessionStorage.setItem(keyFor(userId, day), JSON.stringify({
      ...snapshot,
      profile: safeProfile,
      savedAt: Date.now(),
    }))
  } catch {
    console.warn('[Dashboard] Could not store session cache; loading fresh data next time')
  }
}

export function invalidateDashboardSnapshot(userId: string, day = new Date().toISOString().slice(0, 10)): void {
  try {
    window.sessionStorage.removeItem(keyFor(userId, day))
  } catch {
    console.warn('[Dashboard] Could not clear session cache')
  }
}
