export type RoutePoint = {
  latitude: number
  longitude: number
  timestamp: number
  accuracy: number
}

export type GpsCandidate = RoutePoint
export type ActivityClock = {
  startedAtMs: number
  pausedDurationMs: number
  pausedAtMs: number | null
}

export function startActivityClock(now: number): ActivityClock {
  return { startedAtMs: now, pausedDurationMs: 0, pausedAtMs: null }
}

export function pauseActivityClock(clock: ActivityClock, now: number): ActivityClock {
  return clock.pausedAtMs === null ? { ...clock, pausedAtMs: now } : clock
}

export function resumeActivityClock(clock: ActivityClock, now: number): ActivityClock {
  return clock.pausedAtMs === null
    ? clock
    : { ...clock, pausedDurationMs: clock.pausedDurationMs + now - clock.pausedAtMs, pausedAtMs: null }
}

export function activeDurationSeconds(clock: ActivityClock, now: number) {
  const currentPause = clock.pausedAtMs === null ? 0 : Math.max(0, now - clock.pausedAtMs)
  return Math.max(0, Math.floor((now - clock.startedAtMs - clock.pausedDurationMs - currentPause) / 1000))
}

export function stepProgress(steps: number, goal: number) {
  const safeSteps = Math.max(0, Number.isFinite(steps) ? steps : 0)
  const safeGoal = Math.max(1, Number.isFinite(goal) ? goal : 1)
  return {
    percent: Math.min(100, Math.round((safeSteps / safeGoal) * 100)),
    remaining: Math.max(0, safeGoal - safeSteps),
  }
}

export function distanceBetweenMeters(a: Pick<RoutePoint, 'latitude' | 'longitude'>, b: Pick<RoutePoint, 'latitude' | 'longitude'>) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusMeters = 6_371_000
  const latDelta = radians(b.latitude - a.latitude)
  const lonDelta = radians(b.longitude - a.longitude)
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lonDelta / 2) ** 2
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, haversine)))
}

export function acceptGpsPoint(point: GpsCandidate, previous?: RoutePoint) {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180 ||
    !Number.isFinite(point.timestamp) ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy <= 0 ||
    point.accuracy > 50
  ) return false

  if (!previous) return true
  const elapsedSeconds = (point.timestamp - previous.timestamp) / 1000
  if (elapsedSeconds < 3) return false
  const distanceMeters = distanceBetweenMeters(previous, point)
  if (distanceMeters < 4) return false
  return distanceMeters / elapsedSeconds <= 12
}

export function paceSecondsPerKm(distanceMeters: number, durationSeconds: number) {
  if (distanceMeters < 100 || durationSeconds <= 0) return null
  return Math.round((durationSeconds * 1000) / distanceMeters)
}

export function speedMetersPerSecond(distanceMeters: number, durationSeconds: number) {
  if (distanceMeters <= 0 || durationSeconds <= 0) return null
  return distanceMeters / durationSeconds
}

export function activityMetrics(
  activityType: 'walk' | 'run',
  distanceMeters: number,
  durationSeconds: number,
  weightKg: number | null | undefined,
) {
  return {
    averagePaceSecondsPerKm: paceSecondsPerKm(distanceMeters, durationSeconds),
    averageSpeedMetersPerSecond: speedMetersPerSecond(distanceMeters, durationSeconds),
    estimatedCalories: estimateActivityCalories(activityType, durationSeconds, weightKg),
  }
}

export function gpsErrorState(errorCode: number, permissionDeniedCode: number) {
  return errorCode === permissionDeniedCode ? 'denied' as const : 'lost' as const
}

export function estimateActivityCalories(
  activityType: 'walk' | 'run',
  durationSeconds: number,
  weightKg: number | null | undefined,
) {
  if (!weightKg || !Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300 || durationSeconds <= 0) return null
  const met = activityType === 'run' ? 7 : 3.5
  return Math.round(met * 3.5 * weightKg * (durationSeconds / 60) / 200)
}

export function buildSleepInterval(wakeDate: string, bedtime: string, wakeTime: string, timeZone?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wakeDate) || !/^\d{2}:\d{2}$/.test(bedtime) || !/^\d{2}:\d{2}$/.test(wakeTime) || bedtime === wakeTime) {
    return null
  }
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const toUtc = (date: string, time: string) => {
    const [year, month, day] = date.split('-').map(Number)
    const [hour, minute] = time.split(':').map(Number)
    const target = Date.UTC(year, month - 1, day, hour, minute)
    let candidate = target
    for (let attempt = 0; attempt < 3; attempt++) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(candidate))
      const part = (type: string) => Number(parts.find(item => item.type === type)?.value)
      const displayed = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
      candidate += target - displayed
    }
    const check = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(candidate))
    const value = (type: string) => check.find(item => item.type === type)?.value
    if (
      value('year') !== String(year).padStart(4, '0') ||
      value('month') !== String(month).padStart(2, '0') ||
      value('day') !== String(day).padStart(2, '0') ||
      value('hour') !== String(hour).padStart(2, '0') ||
      value('minute') !== String(minute).padStart(2, '0')
    ) return null
    return new Date(candidate)
  }
  const end = toUtc(wakeDate, wakeTime)
  if (!end) return null
  const startDate = new Date(`${wakeDate}T12:00:00Z`)
  if (bedtime > wakeTime) startDate.setUTCDate(startDate.getUTCDate() - 1)
  const startDateKey = startDate.toISOString().slice(0, 10)
  const start = toUtc(startDateKey, bedtime)
  if (!start) return null
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000)
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) return null
  return { start, end, durationMinutes }
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function dateInTimeZone(date = new Date(), timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
