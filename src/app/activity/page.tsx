'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { MoonIcon, WalkIcon } from '@/lib/icons'
import { supabase } from '@/lib/supabase'
import {
  activeDurationSeconds,
  acceptGpsPoint,
  activityMetrics,
  dateInTimeZone,
  distanceBetweenMeters,
  estimateActivityCalories,
  gpsErrorState,
  isValidTimeZone,
  paceSecondsPerKm,
  RoutePoint,
  pauseActivityClock,
  resumeActivityClock,
  speedMetersPerSecond,
  startActivityClock,
  stepProgress,
} from '@/lib/health-tracking'

type DailySteps = { activity_date: string; steps: number; source: string }
type ActivitySession = {
  id: string
  activity_type: 'walk' | 'run'
  started_at: string
  ended_at: string
  duration_seconds: number
  distance_meters: number
  average_pace_seconds_per_km: number | null
  average_speed_mps: number | null
  estimated_calories: number | null
  route_points: RoutePoint[]
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

type TrackingPreferences = { step_goal: number; sleep_goal_minutes: number; time_zone: string }
const DEFAULT_PREFERENCES: TrackingPreferences = { step_goal: 8000, sleep_goal_minutes: 480, time_zone: 'UTC' }
const MAX_ROUTE_POINTS = 3000

function localDateKey(date = new Date(), timeZone = 'UTC') {
  return dateInTimeZone(date, timeZone)
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function formatPace(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return '—'
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')} /km`
}

function RouteTrace({ points, compact = false }: { points: RoutePoint[]; compact?: boolean }) {
  if (points.length < 2) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: compact ? 110 : 190, borderRadius: 18, background: 'var(--card2)', color: 'var(--muted)', fontSize: 13 }}>
        Route appears as GPS points are recorded.
      </div>
    )
  }
  const longitudes = points.map(point => point.longitude)
  const latitudes = points.map(point => point.latitude)
  const minLon = Math.min(...longitudes), maxLon = Math.max(...longitudes)
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes)
  const width = Math.max(maxLon - minLon, 0.00001)
  const height = Math.max(maxLat - minLat, 0.00001)
  const coords = points.map(point => {
    const x = 18 + ((point.longitude - minLon) / width) * 264
    const y = 18 + ((maxLat - point.latitude) / height) * 144
    return `${x},${y}`
  }).join(' ')
  const last = points[points.length - 1]
  const lastX = 18 + ((last.longitude - minLon) / width) * 264
  const lastY = 18 + ((maxLat - last.latitude) / height) * 144
  return (
    <div aria-label="GPS route trace; street map is not available in this web app" style={{ overflow: 'hidden', borderRadius: 18, background: 'var(--card2)' }}>
      <svg viewBox="0 0 300 180" role="img" style={{ display: 'block', width: '100%', height: compact ? 110 : 190 }}>
        <path d="M0 45H300M0 90H300M0 135H300M75 0V180M150 0V180M225 0V180" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" />
        <polyline points={coords} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={18 + ((points[0].longitude - minLon) / width) * 264} cy={18 + ((maxLat - points[0].latitude) / height) * 144} r="5" fill="var(--green)" />
        <circle cx={lastX} cy={lastY} r="6" fill="var(--primary)" stroke="var(--card)" strokeWidth="3" />
      </svg>
    </div>
  )
}

export default function ActivityPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [todaySteps, setTodaySteps] = useState<DailySteps | null>(null)
  const [stepsInput, setStepsInput] = useState('')
  const [stepGoalInput, setStepGoalInput] = useState(String(DEFAULT_PREFERENCES.step_goal))
  const [sessions, setSessions] = useState<ActivitySession[]>([])
  const [weightKg, setWeightKg] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  const [period, setPeriod] = useState<7 | 30>(7)
  const [activityType, setActivityType] = useState<'walk' | 'run'>('walk')
  const [trackerState, setTrackerState] = useState<'idle' | 'running' | 'paused' | 'saving'>('idle')
  const [locationState, setLocationState] = useState<'not-started' | 'asking' | 'active' | 'denied' | 'unavailable' | 'lost'>('not-started')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [distanceMeters, setDistanceMeters] = useState(0)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([])
  const [selectedSession, setSelectedSession] = useState<ActivitySession | null>(null)
  const clockRef = useRef<ReturnType<typeof startActivityClock> | null>(null)
  const distanceRef = useRef(0)
  const pointsRef = useRef<RoutePoint[]>([])
  const watchIdRef = useRef<number | null>(null)
  const saveLockRef = useRef(false)
  const idempotencyKeyRef = useRef('')

  const timeZone = preferences.time_zone || 'UTC'
  const today = localDateKey(new Date(), timeZone)
  const goal = Number(stepGoalInput) || preferences.step_goal
  const steps = todaySteps?.steps ?? 0
  const progress = stepProgress(steps, goal)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) { router.replace('/auth'); return }
      setUserId(user.id)
      const guessedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const { data: preferenceRow, error: preferenceError } = await supabase
        .from('health_tracking_preferences')
        .select('step_goal, sleep_goal_minutes, time_zone')
        .eq('user_id', user.id)
        .maybeSingle()
      if (preferenceError) throw preferenceError
      const savedTimeZone = preferenceRow?.time_zone || guessedTimeZone
      const resolvedTimeZone = isValidTimeZone(savedTimeZone) ? savedTimeZone : guessedTimeZone
      if (resolvedTimeZone !== savedTimeZone) {
        console.error('[Activity] Stored time zone is invalid; using the device time zone')
        setError('Your saved time zone is invalid. Using the current device time zone; save preferences to update it.')
      }
      const loadedPreferences = preferenceRow
        ? { ...preferenceRow, time_zone: resolvedTimeZone }
        : { ...DEFAULT_PREFERENCES, time_zone: guessedTimeZone }
      setPreferences(loadedPreferences)
      setStepGoalInput(String(loadedPreferences.step_goal))
      const localToday = localDateKey(new Date(), loadedPreferences.time_zone)
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const [{ data: dailyRow, error: dailyError }, { data: sessionRows, error: sessionsError }, { data: profile, error: profileError }] = await Promise.all([
        supabase.from('activity_daily_summaries').select('activity_date, steps, source').eq('user_id', user.id).eq('activity_date', localToday).maybeSingle(),
        supabase.from('activity_sessions').select('id, activity_type, started_at, ended_at, duration_seconds, distance_meters, average_pace_seconds_per_km, average_speed_mps, estimated_calories, route_points').eq('user_id', user.id).gte('started_at', start).order('started_at', { ascending: false }).limit(100),
        supabase.from('profiles').select('current_weight_kg').eq('id', user.id).maybeSingle(),
      ])
      if (dailyError) throw dailyError
      if (sessionsError) throw sessionsError
      if (profileError) throw profileError
      setTodaySteps(dailyRow)
      setStepsInput(dailyRow ? String(dailyRow.steps) : '')
      setSessions((sessionRows ?? []) as ActivitySession[])
      setWeightKg(profile?.current_weight_kg ? Number(profile.current_weight_kg) : null)
    } catch (loadError) {
      console.error('[Activity] Failed to load activity data', loadError)
      setError('Could not load activity tracking. Check your connection and confirm the health tracking migration is applied.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { void loadData() }, [loadData])

  const stopLocationWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const startLocationWatch = useCallback(() => {
    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
      setLocationState('unavailable')
      return
    }
    setLocationState('asking')
    watchIdRef.current = navigator.geolocation.watchPosition(position => {
      const candidate: RoutePoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: position.timestamp,
        accuracy: position.coords.accuracy,
      }
      const previous = pointsRef.current[pointsRef.current.length - 1]
      if (!acceptGpsPoint(candidate, previous)) return
      const next = [...pointsRef.current, candidate]
      if (next.length > MAX_ROUTE_POINTS) next.shift()
      pointsRef.current = next
      setRoutePoints(next)
      setLocationState('active')
      if (previous) {
        distanceRef.current += distanceBetweenMeters(previous, candidate)
        setDistanceMeters(distanceRef.current)
      }
    }, positionError => {
      const nextState = gpsErrorState(positionError.code, positionError.PERMISSION_DENIED)
      if (nextState === 'denied') {
        setLocationState(nextState)
        stopLocationWatch()
      } else {
        setLocationState(nextState)
      }
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 })
  }, [stopLocationWatch])

  useEffect(() => () => stopLocationWatch(), [stopLocationWatch])
  useEffect(() => {
    if (trackerState !== 'running') return
    const timer = window.setInterval(() => {
      if (clockRef.current === null) return
      setElapsedSeconds(activeDurationSeconds(clockRef.current, Date.now()))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [trackerState])
  useEffect(() => {
    if (trackerState !== 'running' && trackerState !== 'paused') return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const guardInternalNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      const navButton = target.closest('nav[aria-label="Bottom navigation"] button')
      const quickLogAction = target.closest('[role="dialog"] button:not([aria-label="Close Quick Log"])')
      const link = target.closest('a[href]')
      if (!navButton && !quickLogAction && !link) return
      if (link instanceof HTMLAnchorElement && link.getAttribute('href')?.startsWith('#')) return
      if (window.confirm('An activity is still in progress. Leave this page and discard the unsaved session and route?')) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    document.addEventListener('click', guardInternalNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving)
      document.removeEventListener('click', guardInternalNavigation, true)
    }
  }, [trackerState])

  function startActivity() {
    if (trackerState !== 'idle' || !userId || clockRef.current !== null) return
    clockRef.current = startActivityClock(Date.now())
    distanceRef.current = 0
    pointsRef.current = []
    idempotencyKeyRef.current = createIdempotencyKey()
    setElapsedSeconds(0)
    setDistanceMeters(0)
    setRoutePoints([])
    setLocationState('not-started')
    setError('')
    setSavedNotice('')
    setTrackerState('running')
    startLocationWatch()
  }

  function pauseActivity() {
    if (trackerState !== 'running') return
    if (clockRef.current) clockRef.current = pauseActivityClock(clockRef.current, Date.now())
    if (clockRef.current) setElapsedSeconds(activeDurationSeconds(clockRef.current, Date.now()))
    setTrackerState('paused')
    stopLocationWatch()
  }

  function resumeActivity() {
    const clock = clockRef.current
    if (trackerState !== 'paused' || !clock || clock.pausedAtMs === null) return
    clockRef.current = resumeActivityClock(clock, Date.now())
    setTrackerState('running')
    startLocationWatch()
  }

  function discardActivity() {
    if (trackerState === 'idle') return
    if (!window.confirm('Discard this activity? The unsaved session and route will be lost.')) return
    stopLocationWatch()
    clockRef.current = null
    pointsRef.current = []
    distanceRef.current = 0
    setRoutePoints([])
    setDistanceMeters(0)
    setElapsedSeconds(0)
    setTrackerState('idle')
  }

  useEffect(() => {
    if (!selectedSession) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSession(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedSession])

  async function deleteSession(session: ActivitySession) {
    if (!userId || !window.confirm('Delete this saved activity and its route data?')) return
    try {
      const { error: deleteError } = await supabase.from('activity_sessions')
        .delete()
        .eq('id', session.id)
        .eq('user_id', userId)
      if (deleteError) throw deleteError
      setSessions(previous => previous.filter(item => item.id !== session.id))
      setSelectedSession(null)
    } catch (deleteError) {
      console.error('[Activity] Failed to delete activity', deleteError)
      setError('Activity was not deleted. Please retry.')
    }
  }

  async function finishActivity() {
    if (saveLockRef.current || trackerState === 'idle' || !userId || clockRef.current === null) return
    saveLockRef.current = true
    setTrackerState('saving')
    setError('')
    stopLocationWatch()
    const endedAtMs = Date.now()
    const startedAtMs = clockRef.current.startedAtMs
    const durationSeconds = Math.max(1, activeDurationSeconds(clockRef.current, endedAtMs))
    const distance = distanceRef.current
    const metrics = activityMetrics(activityType, distance, durationSeconds, weightKg)
    try {
      const payload = {
        user_id: userId,
        idempotency_key: idempotencyKeyRef.current,
        activity_type: activityType,
        started_at: new Date(startedAtMs).toISOString(),
        ended_at: new Date(endedAtMs).toISOString(),
        duration_seconds: durationSeconds,
        distance_meters: distance,
        average_pace_seconds_per_km: metrics.averagePaceSecondsPerKm,
        average_speed_mps: metrics.averageSpeedMetersPerSecond,
        estimated_calories: metrics.estimatedCalories,
        route_points: pointsRef.current,
        source: 'browser_gps',
      }
      let { data: savedSession, error: saveError } = await supabase.from('activity_sessions').insert(payload)
        .select('id, activity_type, started_at, ended_at, duration_seconds, distance_meters, average_pace_seconds_per_km, average_speed_mps, estimated_calories, route_points')
        .single()
      if (saveError?.code === '23505') {
        const existing = await supabase.from('activity_sessions')
          .select('id, activity_type, started_at, ended_at, duration_seconds, distance_meters, average_pace_seconds_per_km, average_speed_mps, estimated_calories, route_points')
          .eq('user_id', userId)
          .eq('idempotency_key', idempotencyKeyRef.current)
          .single()
        savedSession = existing.data
        saveError = existing.error
      }
      if (saveError || !savedSession) throw saveError || new Error('Activity save returned no session')
      setSessions(previous => [savedSession as ActivitySession, ...previous.filter(item => item.id !== savedSession.id)].slice(0, 100))
      setSelectedSession(savedSession as ActivitySession)
      setSavedNotice('Activity saved to your history.')
      clockRef.current = null
      setTrackerState('idle')
    } catch (saveError) {
      console.error('[Activity] Failed to save activity', saveError)
      setError('Activity could not be saved. Your route remains on this screen; retry finishing to save it.')
      setTrackerState('paused')
      if (clockRef.current) clockRef.current = pauseActivityClock(clockRef.current, Date.now())
    } finally {
      saveLockRef.current = false
    }
  }

  async function saveSteps(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return
    const stepsValue = stepsInput.trim() ? Number(stepsInput) : null
    const goalValue = Number(stepGoalInput)
    if (stepsValue !== null && (!Number.isInteger(stepsValue) || stepsValue < 0 || stepsValue > 1_000_000)) {
      setError('Enter a whole-number step total between 0 and 1,000,000.')
      return
    }
    if (!Number.isInteger(goalValue) || goalValue < 1000 || goalValue > 100_000) {
      setError('Step goal must be between 1,000 and 100,000.')
      return
    }
    setSaving(true)
    setError('')
    setSavedNotice('')
    try {
      const now = new Date().toISOString()
      const [{ data: dailyRow, error: dailyError }, { error: preferenceError }] = await Promise.all([
        stepsValue === null
          ? Promise.resolve({ data: todaySteps, error: null })
          : supabase.from('activity_daily_summaries').upsert({
            user_id: userId,
            activity_date: today,
            steps: stepsValue,
            source: 'manual',
            updated_at: now,
          }, { onConflict: 'user_id,activity_date' }).select('activity_date, steps, source').single(),
        supabase.from('health_tracking_preferences').upsert({
          user_id: userId,
          step_goal: goalValue,
          sleep_goal_minutes: preferences.sleep_goal_minutes,
          time_zone: timeZone,
          updated_at: now,
        }, { onConflict: 'user_id' }),
      ])
      if (dailyError) throw dailyError
      if (preferenceError) throw preferenceError
      setTodaySteps(dailyRow)
      setPreferences(previous => ({ ...previous, step_goal: goalValue }))
      setSavedNotice(stepsValue === null ? 'Step goal saved. Add today’s step total whenever you have it.' : 'Steps and goal saved.')
    } catch (saveError) {
      console.error('[Activity] Failed to save step summary', saveError)
      setError('Could not confirm both values were saved. Reload to check, then retry if needed.')
    } finally {
      setSaving(false)
    }
  }

  const todaySessions = useMemo(
    () => sessions.filter(session => localDateKey(new Date(session.started_at), timeZone) === today),
    [sessions, timeZone, today],
  )
  const activeTodaySeconds = todaySessions.reduce((total, session) => total + session.duration_seconds, 0)
  const distanceToday = todaySessions.reduce((total, session) => total + Number(session.distance_meters || 0), 0)
  const caloriesToday = todaySessions.length > 0 && todaySessions.every(session => session.estimated_calories !== null)
    ? todaySessions.reduce((total, session) => total + Number(session.estimated_calories), 0)
    : null
  const trendDays = Array.from({ length: period }, (_, index) => shiftDate(today, index - period + 1))
  const [dailyHistory, setDailyHistory] = useState<DailySteps[]>([])
  const [trendError, setTrendError] = useState('')
  const [trendRetry, setTrendRetry] = useState(0)
  useEffect(() => {
    if (!userId) return
    const firstDay = shiftDate(today, -period + 1)
    setTrendError('')
    void supabase.from('activity_daily_summaries')
      .select('activity_date, steps, source')
      .eq('user_id', userId)
      .gte('activity_date', firstDay)
      .lte('activity_date', today)
      .then(({ data, error: queryError }) => {
        if (queryError) {
          console.error('[Activity] Failed to load step trend', queryError)
          setTrendError('Step trend could not be loaded.')
          return
        }
        setDailyHistory(data ?? [])
      })
      .catch(queryError => {
        console.error('[Activity] Step trend request failed', queryError)
        setTrendError('Step trend could not be loaded.')
      })
  }, [userId, period, today, trendRetry])
  const historyByDate = new Map(dailyHistory.map(row => [row.activity_date, row]))
  const maxSteps = Math.max(goal, ...trendDays.map(day => historyByDate.get(day)?.steps ?? 0), 1)
  const sessionTrends = new Map<string, { distance: number; seconds: number }>()
  for (const session of sessions) {
    const date = localDateKey(new Date(session.started_at), timeZone)
    const current = sessionTrends.get(date) ?? { distance: 0, seconds: 0 }
    current.distance += Number(session.distance_meters || 0)
    current.seconds += session.duration_seconds
    sessionTrends.set(date, current)
  }
  const maxDistance = Math.max(100, ...trendDays.map(day => sessionTrends.get(day)?.distance ?? 0))
  const maxActiveMinutes = Math.max(1, ...trendDays.map(day => (sessionTrends.get(day)?.seconds ?? 0) / 60))
  const activityTypes = (['walk', 'run'] as const).map(type => ({
    type,
    count: sessions.filter(session => session.activity_type === type).length,
    distance: sessions.filter(session => session.activity_type === type).reduce((sum, session) => sum + Number(session.distance_meters || 0), 0),
    seconds: sessions.filter(session => session.activity_type === type).reduce((sum, session) => sum + session.duration_seconds, 0),
  }))

  return (
    <main className="page-root" style={{ maxWidth: 620 }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em' }}>MOVEMENT</p>
        <h1 style={{ color: 'var(--text)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', marginTop: 5 }}>Activity</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, marginTop: 7 }}>Daily steps and GPS-tracked walks or runs. Steps entered here are manual unless a connected device is shown.</p>
      </header>

      {error && <div role="alert" style={{ marginBottom: 14, padding: 12, borderRadius: 14, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }}>{error} <button type="button" onClick={() => void loadData()} style={{ marginLeft: 8, border: 0, background: 'none', color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Retry</button></div>}
      {savedNotice && <p role="status" style={{ color: 'var(--green)', fontSize: 13, marginBottom: 12 }}>{savedNotice}</p>}

      <section className="card" aria-labelledby="steps-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'var(--primary-bg)', color: 'var(--primary)' }}><WalkIcon size={21} /></div>
          <div style={{ flex: 1 }}>
            <h2 id="steps-heading" style={{ fontSize: 17, fontWeight: 750 }}>Daily steps</h2>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{todaySteps ? (todaySteps.source === 'manual' ? 'Manually entered' : `${todaySteps.source} data`) : 'No step total recorded today'}</p>
          </div>
          <strong style={{ color: 'var(--primary)', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{progress.percent}%</strong>
        </div>
        {loading ? <div aria-busy="true" className="skeleton" style={{ height: 78, marginTop: 16 }} /> : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 20 }}>
              <strong style={{ fontSize: 32, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{steps.toLocaleString()}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>of {goal.toLocaleString()} steps</span>
            </div>
            <div role="progressbar" aria-label="Daily step goal" aria-valuenow={Math.min(steps, goal)} aria-valuemin={0} aria-valuemax={goal} style={{ height: 8, marginTop: 10, overflow: 'hidden', borderRadius: 9, background: 'var(--card2)' }}>
              <div style={{ width: `${progress.percent}%`, height: '100%', borderRadius: 9, background: 'var(--primary)', transition: 'width .3s ease' }} />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>{steps ? `${progress.remaining.toLocaleString()} steps remaining` : 'Record a step total to start your progress.'}</p>
          </>
        )}
        <form onSubmit={saveSteps} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 8, alignItems: 'end', marginTop: 16 }}>
          <label style={{ color: 'var(--text-2)', fontSize: 11, fontWeight: 700 }}>Today’s steps
            <input aria-label="Today's steps" type="number" min="0" max="1000000" step="1" inputMode="numeric" value={stepsInput} onChange={event => setStepsInput(event.target.value)} placeholder="e.g. 6240" style={{ display: 'block', marginTop: 5, padding: '10px 8px', fontSize: 14 }} />
          </label>
          <label style={{ color: 'var(--text-2)', fontSize: 11, fontWeight: 700 }}>Daily goal
            <input aria-label="Daily step goal" type="number" min="1000" max="100000" step="500" inputMode="numeric" value={stepGoalInput} onChange={event => setStepGoalInput(event.target.value)} style={{ display: 'block', marginTop: 5, padding: '10px 8px', fontSize: 14 }} />
          </label>
          <button type="submit" disabled={saving || loading} className="btn btn-primary" style={{ width: 'auto', padding: '10px 12px', fontSize: 12 }}>{saving ? 'Saving' : 'Save'}</button>
        </form>
      </section>

      <section className="card" aria-labelledby="activity-summary-heading" style={{ marginTop: 14 }}>
        <h2 id="activity-summary-heading" style={{ fontSize: 17, fontWeight: 750, marginBottom: 14 }}>Activity summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          {[
            { label: 'Distance today', value: distanceToday > 0 ? `${(distanceToday / 1000).toFixed(2)} km` : '—' },
            { label: 'Active time', value: activeTodaySeconds ? formatDuration(activeTodaySeconds) : '—' },
            { label: 'Estimated calories', value: caloriesToday !== null ? `~${Math.round(caloriesToday)} kcal` : '—' },
            { label: 'Tracked sessions', value: String(todaySessions.length) },
          ].map(item => <div key={item.label} style={{ padding: 12, borderRadius: 14, background: 'var(--surface)' }}><p style={{ color: 'var(--muted)', fontSize: 11 }}>{item.label}</p><strong style={{ display: 'block', marginTop: 5, fontSize: 16 }}>{item.value}</strong></div>)}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 11, lineHeight: 1.5, marginTop: 11 }}>Only GPS-tracked walks and runs are included. They are not added to strength-workout logs, avoiding double-counting. Calorie values are estimates and shown only when your profile has a weight.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 12 }}>
          {activityTypes.map(item => <div key={item.type} style={{ padding: 10, borderRadius: 12, background: 'var(--surface)' }}>
            <strong style={{ display: 'block', fontSize: 12, textTransform: 'capitalize' }}>{item.type === 'walk' ? 'Walking' : 'Running'}</strong>
            <span style={{ display: 'block', color: 'var(--muted)', fontSize: 10, marginTop: 4 }}>{item.count ? `${item.count} sessions · ${(item.distance / 1000).toFixed(1)} km · ${Math.round(item.seconds / 60)} min` : 'No sessions in recent history'}</span>
          </div>)}
        </div>
      </section>

      <section className="card" aria-labelledby="tracker-heading" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
          <div>
            <p style={{ color: 'var(--primary)', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em' }}>FOREGROUND GPS</p>
            <h2 id="tracker-heading" style={{ fontSize: 18, fontWeight: 750, marginTop: 4 }}>Walking &amp; running</h2>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 12, background: 'var(--card2)' }}>
            {(['walk', 'run'] as const).map(type => <button key={type} type="button" disabled={trackerState !== 'idle'} onClick={() => setActivityType(type)} aria-pressed={activityType === type} style={{ border: 0, borderRadius: 9, padding: '7px 10px', background: activityType === type ? 'var(--card)' : 'transparent', color: activityType === type ? 'var(--primary)' : 'var(--muted)', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{type === 'walk' ? 'Walk' : 'Run'}</button>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, margin: '18px 0' }}>
          {[
            { label: 'Elapsed', value: formatDuration(elapsedSeconds) },
            { label: 'Distance', value: `${(distanceMeters / 1000).toFixed(2)} km` },
            { label: 'Avg. pace', value: formatPace(paceSecondsPerKm(distanceMeters, elapsedSeconds)) },
            { label: 'Speed', value: speedMetersPerSecond(distanceMeters, elapsedSeconds) ? `${(speedMetersPerSecond(distanceMeters, elapsedSeconds)! * 3.6).toFixed(1)} km/h` : '—' },
          ].map(item => <div key={item.label} style={{ textAlign: 'center', padding: '10px 4px', borderRadius: 12, background: 'var(--surface)' }}><strong style={{ display: 'block', fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{item.value}</strong><span style={{ display: 'block', color: 'var(--muted)', fontSize: 10, marginTop: 4 }}>{item.label}</span></div>)}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: -8, marginBottom: 12 }}>Estimated calories: {estimateActivityCalories(activityType, elapsedSeconds, weightKg) ?? 'not available'}{weightKg ? ' kcal' : ''}</p>
        <RouteTrace points={routePoints} />
        <p role="status" style={{ color: locationState === 'denied' || locationState === 'unavailable' ? 'var(--orange)' : 'var(--muted)', fontSize: 12, marginTop: 10 }}>
          {locationState === 'active' ? `GPS active · ${routePoints.length} accepted route points` :
            locationState === 'asking' ? 'Waiting for location permission and GPS fix…' :
              locationState === 'denied' ? 'Location permission was denied. Time-only tracking is still available; enable location in browser settings to record a route.' :
                locationState === 'unavailable' ? 'Secure page and browser location support are required for GPS. Time-only tracking remains available.' :
                  locationState === 'lost' ? 'GPS signal is unavailable. Waiting for another location fix…' :
                    'Your location is requested only after you start. The map shows a private route trace, not a street map.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {trackerState === 'idle' ? <button type="button" onClick={startActivity} disabled={!userId || loading} className="btn btn-primary" style={{ flex: 1 }}>Start {activityType === 'walk' ? 'walking' : 'running'}</button> : <>
            {trackerState === 'running' ? <button type="button" onClick={pauseActivity} className="btn btn-secondary" style={{ flex: 1 }}>Pause</button> : <button type="button" onClick={resumeActivity} disabled={trackerState === 'saving'} className="btn btn-primary" style={{ flex: 1 }}>{trackerState === 'saving' ? 'Saving…' : 'Resume'}</button>}
            <button type="button" onClick={() => void finishActivity()} disabled={trackerState === 'saving'} className="btn btn-primary" style={{ flex: 1 }}>Finish &amp; save</button>
            <button type="button" onClick={discardActivity} disabled={trackerState === 'saving'} className="btn btn-secondary" style={{ flex: '1 0 100%', color: 'var(--red)' }}>Discard activity</button>
          </>}
        </div>
      </section>

      <section className="card" aria-labelledby="step-history-heading" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="step-history-heading" style={{ fontSize: 17, fontWeight: 750 }}>Step history</h2>
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 11, background: 'var(--card2)' }}>
            {([7, 30] as const).map(value => <button key={value} type="button" onClick={() => setPeriod(value)} aria-pressed={period === value} style={{ padding: '6px 9px', border: 0, borderRadius: 8, background: period === value ? 'var(--card)' : 'transparent', color: period === value ? 'var(--primary)' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{value === 7 ? 'Week' : 'Month'}</button>)}
          </div>
        </div>
        {loading ? <div className="skeleton" aria-busy="true" style={{ height: 100, marginTop: 16 }} /> : trendError ? (
          <p role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 14 }}>{trendError} <button type="button" onClick={() => setTrendRetry(value => value + 1)} style={{ border: 0, background: 'none', color: 'inherit', font: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Retry</button></p>
        ) : dailyHistory.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>No step history yet. Add a daily total above to start a trend.</p>
        ) : (
          <div aria-label={`${period}-day step history`} style={{ display: 'grid', gridTemplateColumns: `repeat(${period}, minmax(0,1fr))`, gap: period === 7 ? 8 : 3, alignItems: 'end', height: 128, marginTop: 18, overflowX: period === 30 ? 'auto' : 'visible' }}>
            {trendDays.map(day => {
              const row = historyByDate.get(day)
              const height = row ? Math.max(4, Math.round((row.steps / maxSteps) * 92)) : 3
              return <div key={day} title={`${day}: ${row ? row.steps.toLocaleString() : 'no entry'} steps`} style={{ display: 'flex', minWidth: 0, height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'end', gap: 5 }}>
                <div style={{ height, width: '100%', minWidth: period === 30 ? 4 : 10, borderRadius: 6, background: row ? row.steps >= goal ? 'var(--green)' : 'var(--primary)' : 'var(--card2)' }} />
                {(period === 7 || day.endsWith('-01') || day === today) && <span style={{ color: 'var(--muted)', fontSize: 9 }}>{day.slice(5).replace('-', '/')}</span>}
              </div>
            })}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="activity-trends-heading" style={{ marginTop: 14 }}>
        <h2 id="activity-trends-heading" style={{ fontSize: 17, fontWeight: 750 }}>Walking &amp; running trends</h2>
        <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Saved GPS sessions · {period === 7 ? 'last 7 days' : 'last 30 days'}</p>
        {sessions.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>No completed sessions to chart yet.</p> : (
          <div style={{ display: 'grid', gap: 18, marginTop: 16 }}>
            {[
              { label: 'Distance', unit: 'km', max: maxDistance, value: (day: string) => sessionTrends.get(day)?.distance ?? 0, color: 'var(--primary)' },
              { label: 'Active time', unit: 'min', max: maxActiveMinutes, value: (day: string) => Math.round((sessionTrends.get(day)?.seconds ?? 0) / 60), color: 'var(--green)' },
            ].map(chart => <div key={chart.label}>
              <p style={{ color: 'var(--text-2)', fontSize: 11, fontWeight: 700, marginBottom: 7 }}>{chart.label}</p>
              <div aria-label={`${chart.label} by day`} style={{ display: 'grid', gridTemplateColumns: `repeat(${period}, minmax(0,1fr))`, gap: period === 7 ? 8 : 3, alignItems: 'end', height: 94 }}>
                {trendDays.map(day => {
                  const value = chart.value(day)
                  const height = value ? Math.max(4, Math.round((value / chart.max) * 68)) : 3
                  return <div key={day} title={`${day}: ${chart.label === 'Distance' ? `${(value / 1000).toFixed(2)} km` : `${value} min`}`} style={{ display: 'flex', minWidth: 0, height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'end', gap: 4 }}>
                    <div style={{ width: '100%', minWidth: period === 30 ? 4 : 10, height, borderRadius: 5, background: value ? chart.color : 'var(--card2)' }} />
                    {(period === 7 || day.endsWith('-01') || day === today) && <span style={{ color: 'var(--muted)', fontSize: 9 }}>{day.slice(5).replace('-', '/')}</span>}
                  </div>
                })}
              </div>
            </div>)}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="activity-history-heading" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="activity-history-heading" style={{ fontSize: 17, fontWeight: 750 }}>Activity history</h2>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Recent 30 days</span>
        </div>
        {loading ? <div className="skeleton" aria-busy="true" style={{ height: 60, marginTop: 14 }} /> : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 8px 8px', color: 'var(--muted)' }}>
            <WalkIcon size={24} color="var(--primary)" />
            <p style={{ fontSize: 13, marginTop: 8 }}>Your completed GPS walks and runs will appear here.</p>
          </div>
        ) : <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          {sessions.map(session => <button key={session.id} type="button" onClick={() => setSelectedSession(session)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--primary-bg)', color: 'var(--primary)' }}><WalkIcon size={19} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 13, textTransform: 'capitalize' }}>{session.activity_type} · {(Number(session.distance_meters) / 1000).toFixed(2)} km</strong>
              <span style={{ display: 'block', marginTop: 4, color: 'var(--muted)', fontSize: 11 }}>{new Date(session.started_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {formatDuration(session.duration_seconds)}</span>
            </span>
            <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
          </button>)}
        </div>}
      </section>

      <button type="button" onClick={() => router.push('/sleep')} className="card" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, color: 'var(--text)', textAlign: 'left', cursor: 'pointer' }}>
        <MoonIcon size={21} color="var(--primary)" />
        <span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 14 }}>Sleep &amp; recovery</strong><span style={{ color: 'var(--muted)', fontSize: 12 }}>View your sleep log and trends</span></span>
        <span aria-hidden="true" style={{ color: 'var(--muted)' }}>›</span>
      </button>

      {selectedSession && <div onMouseDown={event => event.target === event.currentTarget && setSelectedSession(null)} style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(15,23,42,.5)' }}>
        <section role="dialog" aria-modal="true" aria-labelledby="session-detail-title" className="card" style={{ width: '100%', maxWidth: 430, maxHeight: '85dvh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
            <div><p style={{ color: 'var(--primary)', fontSize: 10, fontWeight: 800, letterSpacing: '.1em' }}>SAVED ACTIVITY</p><h2 id="session-detail-title" style={{ marginTop: 4, textTransform: 'capitalize' }}>{selectedSession.activity_type}</h2></div>
            <button type="button" autoFocus onClick={() => setSelectedSession(null)} aria-label="Close activity details" style={{ width: 34, height: 34, border: 0, borderRadius: 17, background: 'var(--card2)', color: 'var(--text)', fontSize: 20, cursor: 'pointer' }}>×</button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 14px' }}>{new Date(selectedSession.started_at).toLocaleString()}</p>
          <RouteTrace points={selectedSession.route_points ?? []} compact />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 14 }}>
            <Metric label="Duration" value={formatDuration(selectedSession.duration_seconds)} />
            <Metric label="Distance" value={`${(Number(selectedSession.distance_meters) / 1000).toFixed(2)} km`} />
            <Metric label="Average pace" value={formatPace(selectedSession.average_pace_seconds_per_km)} />
            <Metric label="Average speed" value={selectedSession.average_speed_mps ? `${(selectedSession.average_speed_mps * 3.6).toFixed(1)} km/h` : '—'} />
            <Metric label="Estimated calories" value={selectedSession.estimated_calories !== null ? `~${Math.round(selectedSession.estimated_calories)} kcal` : 'Unavailable'} />
          </div>
          <button type="button" onClick={() => void deleteSession(selectedSession)} style={{ width: '100%', marginTop: 12, padding: 11, border: '1px solid var(--red)', borderRadius: 12, background: 'var(--red-bg)', color: 'var(--red)', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete activity and route</button>
        </section>
      </div>}
      <BottomNav />
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 11, borderRadius: 12, background: 'var(--surface)' }}><span style={{ display: 'block', color: 'var(--muted)', fontSize: 10 }}>{label}</span><strong style={{ display: 'block', marginTop: 5, fontSize: 14 }}>{value}</strong></div>
}
