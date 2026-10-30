'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'
import { dateInTimeZone, localDateString, buildSleepInterval, isValidTimeZone } from '@/lib/health-tracking'
import { WEB_HEALTH_DATA_STATUS } from '@/lib/health-data-source'

type SleepLog = {
  id: string
  sleep_date: string
  started_at: string
  ended_at: string
  duration_minutes: number
  time_in_bed_minutes: number | null
  source: string
  notes: string | null
}
type TrackingPreferences = { step_goal: number; sleep_goal_minutes: number; time_zone: string }
const DEFAULT_PREFERENCES: TrackingPreferences = { step_goal: 8000, sleep_goal_minutes: 480, time_zone: 'UTC' }

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder}m`
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dayShift(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function localClockMinutes(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return value('hour') * 60 + value('minute')
}

export default function SleepPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [logs, setLogs] = useState<SleepLog[]>([])
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [sleepDate, setSleepDate] = useState(localDateString())
  const [bedtime, setBedtime] = useState('22:30')
  const [wakeTime, setWakeTime] = useState('06:30')
  const [timeInBed, setTimeInBed] = useState('')
  const [notes, setNotes] = useState('')
  const [goalInput, setGoalInput] = useState(String(DEFAULT_PREFERENCES.sleep_goal_minutes))
  const [period, setPeriod] = useState<7 | 30>(7)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingGoal, setSavingGoal] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const loadLogs = useCallback(async (uid: string) => {
    const { data, error: queryError } = await supabase
      .from('sleep_logs')
      .select('id, sleep_date, started_at, ended_at, duration_minutes, time_in_bed_minutes, source, notes')
      .eq('user_id', uid)
      .order('sleep_date', { ascending: false })
      .limit(30)
    if (queryError) throw queryError
    setLogs((data ?? []) as SleepLog[])
  }, [])

  const load = useCallback(async () => {
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
        console.error('[Sleep] Stored time zone is invalid; using the device time zone')
        setError('Your saved time zone is invalid. Using the current device time zone; save preferences to update it.')
      }
      const loadedPreferences = preferenceRow
        ? { ...preferenceRow, time_zone: resolvedTimeZone }
        : { ...DEFAULT_PREFERENCES, time_zone: guessedTimeZone }
      setPreferences(loadedPreferences)
      setGoalInput(String(loadedPreferences.sleep_goal_minutes))
      setSleepDate(dateInTimeZone(new Date(), loadedPreferences.time_zone))
      await loadLogs(user.id)
    } catch (loadError) {
      console.error('[Sleep] Failed to load sleep data', loadError)
      setError('Could not load sleep tracking. Check your connection and confirm the health tracking migration is applied.')
    } finally {
      setLoading(false)
    }
  }, [loadLogs, router])

  useEffect(() => { void load() }, [load])

  const lastNight = logs[0] ?? null
  const goal = Number(goalInput) || preferences.sleep_goal_minutes
  const goalProgress = lastNight ? Math.min(100, Math.round((lastNight.duration_minutes / Math.max(goal, 1)) * 100)) : 0
  const today = dateInTimeZone(new Date(), preferences.time_zone)
  const trendDays = Array.from({ length: period }, (_, index) => dayShift(today, index - period + 1))
  const sleepByDate = useMemo(() => {
    const totals = new Map<string, number>()
    logs.forEach(log => totals.set(log.sleep_date, (totals.get(log.sleep_date) ?? 0) + log.duration_minutes))
    return totals
  }, [logs])
  const scheduleLogs = logs.filter(log => log.sleep_date >= dayShift(today, -6))
  const bedtimeMinutes = scheduleLogs.map(log => {
    const minutes = localClockMinutes(log.started_at, preferences.time_zone)
    return minutes < 12 * 60 ? minutes + 24 * 60 : minutes
  })
  const wakeMinutes = scheduleLogs.map(log => localClockMinutes(log.ended_at, preferences.time_zone))
  const bedtimeRange = bedtimeMinutes.length > 1 ? Math.max(...bedtimeMinutes) - Math.min(...bedtimeMinutes) : null
  const wakeRange = wakeMinutes.length > 1 ? Math.max(...wakeMinutes) - Math.min(...wakeMinutes) : null
  const maxDuration = Math.max(goal, ...trendDays.map(day => sleepByDate.get(day) ?? 0), 1)

  async function saveSleep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) {
      setError('Please sign in again before saving sleep.')
      return
    }
    const interval = buildSleepInterval(sleepDate, bedtime, wakeTime, preferences.time_zone)
    if (!interval) {
      setError('Choose valid times in your time zone. Sleep intervals cannot exceed 24 hours, and times skipped by a daylight-saving change are not valid.')
      return
    }
    const enteredTimeInBed = timeInBed ? Number(timeInBed) : null
    if (enteredTimeInBed !== null && (!Number.isInteger(enteredTimeInBed) || enteredTimeInBed < interval.durationMinutes || enteredTimeInBed > 1440)) {
      setError('Time in bed must be a whole number at least as long as sleep and no more than 24 hours.')
      return
    }

    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const { data: overlaps, error: overlapError } = await supabase
        .from('sleep_logs')
        .select('id')
        .eq('user_id', userId)
        .lt('started_at', interval.end.toISOString())
        .gt('ended_at', interval.start.toISOString())
        .limit(1)
      if (overlapError) throw overlapError
      if (overlaps?.length) {
        setError('This sleep period overlaps a saved record. Check your history before adding it again.')
        return
      }
      const { data: inserted, error: insertError } = await supabase
        .from('sleep_logs')
        .insert({
          user_id: userId,
          sleep_date: sleepDate,
          started_at: interval.start.toISOString(),
          ended_at: interval.end.toISOString(),
          duration_minutes: interval.durationMinutes,
          time_in_bed_minutes: enteredTimeInBed,
          source: 'manual',
          notes: notes.trim() || null,
        })
        .select('id, sleep_date, started_at, ended_at, duration_minutes, time_in_bed_minutes, source, notes')
        .single()
      if (insertError) throw insertError
      setLogs(previous => [inserted as SleepLog, ...previous].sort((a, b) => b.sleep_date.localeCompare(a.sleep_date)).slice(0, 30))
      setSaved(true)
      setNotes('')
      setTimeInBed('')
    } catch (saveError) {
      console.error('[Sleep] Failed to save sleep log', saveError)
      setError('Sleep was not saved. If this period was just submitted, refresh history before retrying.')
    } finally {
      setSaving(false)
    }
  }

  async function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return
    const goalMinutes = Number(goalInput)
    if (!Number.isInteger(goalMinutes) || goalMinutes < 180 || goalMinutes > 900) {
      setError('Sleep goal must be between 3 and 15 hours.')
      return
    }
    setSavingGoal(true)
    setError('')
    setSaved(false)
    try {
      const { error: saveError } = await supabase.from('health_tracking_preferences').upsert({
        user_id: userId,
        step_goal: preferences.step_goal,
        sleep_goal_minutes: goalMinutes,
        time_zone: preferences.time_zone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (saveError) throw saveError
      setPreferences(previous => ({ ...previous, sleep_goal_minutes: goalMinutes }))
      setSaved(true)
    } catch (saveError) {
      console.error('[Sleep] Failed to save sleep goal', saveError)
      setError('Your sleep goal was not saved. Please retry.')
    } finally {
      setSavingGoal(false)
    }
  }

  async function deleteSleepLog(log: SleepLog) {
    if (!userId || !window.confirm('Delete this sleep record?')) return
    try {
      const { error: deleteError } = await supabase.from('sleep_logs')
        .delete()
        .eq('id', log.id)
        .eq('user_id', userId)
      if (deleteError) throw deleteError
      setLogs(previous => previous.filter(item => item.id !== log.id))
    } catch (deleteError) {
      console.error('[Sleep] Failed to delete sleep record', deleteError)
      setError('Sleep record was not deleted. Please retry.')
    }
  }

  return (
    <main className="page-root" style={{ maxWidth: 620 }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em' }}>RECOVERY</p>
        <h1 style={{ color: 'var(--text)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', marginTop: 5 }}>Sleep</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, marginTop: 7 }}>Log your sleep or review records you have entered. This web app does not measure sleep or stages.</p>
      </header>

      {error && <p role="alert" style={{ marginBottom: 14, padding: 12, borderRadius: 14, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13 }}>{error} <button type="button" onClick={() => void load()} style={{ marginLeft: 8, border: 0, background: 'none', color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Retry</button></p>}
      {saved && <p role="status" style={{ color: 'var(--green)', fontSize: 13, marginBottom: 12 }}>Sleep data saved.</p>}

      <section className="card" aria-labelledby="sleep-summary-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
          <div><p style={{ color: 'var(--primary)', fontSize: 10, fontWeight: 800, letterSpacing: '.1em' }}>SLEEP SUMMARY</p><h2 id="sleep-summary-heading" style={{ marginTop: 4, fontSize: 17, fontWeight: 750 }}>Last recorded night</h2></div>
          <span style={{ padding: '5px 9px', borderRadius: 99, background: 'var(--primary-bg)', color: 'var(--primary)', fontSize: 10, fontWeight: 750 }}>{lastNight?.source === 'manual' || !lastNight ? 'Manual' : lastNight.source}</span>
        </div>
        {loading ? <div aria-busy="true" className="skeleton" style={{ height: 90, marginTop: 14 }} /> : lastNight ? <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 18 }}>
            <strong style={{ fontSize: 34, letterSpacing: '-.04em' }}>{durationLabel(lastNight.duration_minutes)}</strong>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>of {durationLabel(goal)} goal</span>
          </div>
          <div role="progressbar" aria-label="Sleep duration goal" aria-valuenow={Math.min(lastNight.duration_minutes, goal)} aria-valuemin={0} aria-valuemax={goal} style={{ height: 8, marginTop: 10, overflow: 'hidden', borderRadius: 9, background: 'var(--card2)' }}>
            <div style={{ width: `${goalProgress}%`, height: '100%', borderRadius: 9, background: 'var(--primary)' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 11, color: 'var(--muted)', fontSize: 12 }}>
            <span>{lastNight.duration_minutes >= goal ? `${durationLabel(lastNight.duration_minutes - goal)} above goal` : `${durationLabel(goal - lastNight.duration_minutes)} below goal`}</span>
            <span>·</span><span>{formatTime(lastNight.started_at)}–{formatTime(lastNight.ended_at)}</span>
            {lastNight.time_in_bed_minutes && <><span>·</span><span>{durationLabel(lastNight.time_in_bed_minutes)} in bed</span></>}
          </div>
        </> : <div style={{ marginTop: 16, padding: 14, borderRadius: 15, background: 'var(--surface)' }}><strong style={{ fontSize: 14 }}>No sleep record yet</strong><p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>Use the manual form below. Native HealthKit and Health Connect imports are not connected in this web release.</p></div>}
      </section>

      <section className="card" aria-labelledby="sleep-goal-heading" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div><h2 id="sleep-goal-heading" style={{ fontSize: 16, fontWeight: 750 }}>Sleep-duration goal</h2><p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>Choose a personal target from 3 to 15 hours.</p></div>
          <form onSubmit={saveGoal} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input aria-label="Sleep goal in minutes" type="number" min="180" max="900" step="15" value={goalInput} onChange={event => setGoalInput(event.target.value)} style={{ width: 82, padding: '9px 7px', fontSize: 13 }} />
            <button type="submit" disabled={savingGoal || loading} className="btn btn-primary" style={{ width: 'auto', padding: '10px 11px', fontSize: 12 }}>{savingGoal ? '…' : 'Save'}</button>
          </form>
        </div>
      </section>

      <section className="card" aria-labelledby="sleep-log-heading" style={{ marginTop: 14 }}>
        <h2 id="sleep-log-heading" style={{ fontSize: 17, fontWeight: 750 }}>Log sleep manually</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, marginTop: 5, marginBottom: 16 }}>Select the date you woke up. Bedtime before wake time is recorded as the previous evening in {preferences.time_zone}.</p>
        <form onSubmit={saveSleep}>
          <label style={{ display: 'block', color: 'var(--text-2)', fontSize: 12, fontWeight: 650, marginBottom: 13 }}>Wake-up date
            <input type="date" value={sleepDate} max={today} onChange={event => setSleepDate(event.target.value)} required style={{ display: 'block', marginTop: 6, background: 'var(--surface)' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            <label style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 650 }}>Bedtime
              <input aria-label="Bedtime" type="time" value={bedtime} onChange={event => setBedtime(event.target.value)} required style={{ display: 'block', marginTop: 6, background: 'var(--surface)' }} />
            </label>
            <label style={{ color: 'var(--text-2)', fontSize: 12, fontWeight: 650 }}>Wake-up time
              <input aria-label="Wake-up time" type="time" value={wakeTime} onChange={event => setWakeTime(event.target.value)} required style={{ display: 'block', marginTop: 6, background: 'var(--surface)' }} />
            </label>
          </div>
          <label style={{ display: 'block', color: 'var(--text-2)', fontSize: 12, fontWeight: 650, marginTop: 12 }}>Time in bed (optional, minutes)
            <input type="number" min="1" max="1440" step="1" value={timeInBed} onChange={event => setTimeInBed(event.target.value)} placeholder="Only if known" style={{ display: 'block', marginTop: 6, background: 'var(--surface)' }} />
          </label>
          <label style={{ display: 'block', color: 'var(--text-2)', fontSize: 12, fontWeight: 650, marginTop: 12 }}>Notes (optional)
            <textarea maxLength={1000} rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Anything you want to remember" style={{ display: 'block', marginTop: 6, resize: 'vertical', background: 'var(--surface)' }} />
          </label>
          <button type="submit" disabled={saving || loading} className="btn btn-primary" style={{ marginTop: 15 }}>{saving ? 'Saving…' : 'Save sleep record'}</button>
        </form>
      </section>

      <section className="card" aria-labelledby="sleep-trends-heading" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div><h2 id="sleep-trends-heading" style={{ fontSize: 17, fontWeight: 750 }}>Sleep trends</h2><p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>Recorded duration by wake-up date</p></div>
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 11, background: 'var(--card2)' }}>
            {([7, 30] as const).map(value => <button key={value} type="button" onClick={() => setPeriod(value)} aria-pressed={period === value} style={{ padding: '6px 9px', border: 0, borderRadius: 8, background: period === value ? 'var(--card)' : 'transparent', color: period === value ? 'var(--primary)' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{value === 7 ? 'Week' : 'Month'}</button>)}
          </div>
        </div>
        {loading ? <div className="skeleton" aria-busy="true" style={{ height: 100, marginTop: 14 }} /> : logs.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>Log sleep to begin a trend. No historical values are estimated.</p> : (
          <div aria-label={`${period}-day sleep history`} style={{ display: 'grid', gridTemplateColumns: `repeat(${period}, minmax(0,1fr))`, gap: period === 7 ? 8 : 3, alignItems: 'end', height: 130, marginTop: 16 }}>
            {trendDays.map(day => {
              const value = sleepByDate.get(day)
              const height = value ? Math.max(4, Math.round((value / maxDuration) * 92)) : 3
              return <div key={day} title={`${day}: ${value ? durationLabel(value) : 'no record'}`} style={{ display: 'flex', minWidth: 0, height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'end', gap: 5 }}>
                <div style={{ height, width: '100%', minWidth: period === 30 ? 4 : 10, borderRadius: 6, background: value ? value >= goal ? 'var(--green)' : 'var(--primary)' : 'var(--card2)' }} />
                {(period === 7 || day.endsWith('-01') || day === today) && <span style={{ color: 'var(--muted)', fontSize: 9 }}>{day.slice(5).replace('-', '/')}</span>}
              </div>
            })}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="sleep-schedule-heading" style={{ marginTop: 14 }}>
        <h2 id="sleep-schedule-heading" style={{ fontSize: 16, fontWeight: 750 }}>Sleep schedule</h2>
        {scheduleLogs.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 7 }}>Add records to see bedtime and wake-up consistency.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9, marginTop: 10 }}>
            <div style={{ padding: 11, borderRadius: 12, background: 'var(--surface)' }}>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>Bedtime variation · {scheduleLogs.length} record{scheduleLogs.length === 1 ? '' : 's'}</span>
              <strong style={{ display: 'block', marginTop: 5, fontSize: 14 }}>{bedtimeRange === null ? 'Need 2+ nights' : `${Math.floor(bedtimeRange / 60)}h ${bedtimeRange % 60}m range`}</strong>
            </div>
            <div style={{ padding: 11, borderRadius: 12, background: 'var(--surface)' }}>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>Wake-time variation</span>
              <strong style={{ display: 'block', marginTop: 5, fontSize: 14 }}>{wakeRange === null ? 'Need 2+ nights' : `${Math.floor(wakeRange / 60)}h ${wakeRange % 60}m range`}</strong>
            </div>
          </div>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 10, lineHeight: 1.45, marginTop: 8 }}>Variation is the range across available recorded times, not a sleep-quality score.</p>
      </section>

      <section className="card" aria-labelledby="sleep-history-title" style={{ marginTop: 14 }}>
        <h2 id="sleep-history-title" style={{ fontSize: 17, fontWeight: 750 }}>Sleep history</h2>
        {loading ? <div className="skeleton" aria-busy="true" style={{ height: 60, marginTop: 12 }} /> : logs.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>Your saved sleep records will appear here.</p> : (
          <ul style={{ display: 'grid', gap: 9, padding: 0, listStyle: 'none', marginTop: 12 }}>
            {logs.map(log => <li key={log.id} style={{ padding: 13, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                <strong style={{ color: 'var(--text)', fontSize: 13 }}>{new Date(`${log.sleep_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <strong style={{ color: 'var(--primary)', fontSize: 14 }}>{durationLabel(log.duration_minutes)}</strong>
                  <button type="button" onClick={() => void deleteSleepLog(log)} aria-label={`Delete sleep record from ${log.sleep_date}`} style={{ padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', color: 'var(--muted)', font: 'inherit', fontSize: 10, cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 5 }}>{formatTime(log.started_at)} – {formatTime(log.ended_at)} · {log.source === 'manual' ? 'Manual entry' : log.source}</p>
              {log.time_in_bed_minutes && <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>{durationLabel(log.time_in_bed_minutes)} in bed</p>}
              {log.notes && <p style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5, marginTop: 7 }}>{log.notes}</p>}
            </li>)}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="sleep-sources-heading" style={{ marginTop: 14 }}>
        <h2 id="sleep-sources-heading" style={{ fontSize: 16, fontWeight: 750 }}>Data sources</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.55, marginTop: 7 }}>{WEB_HEALTH_DATA_STATUS.sleep} {WEB_HEALTH_DATA_STATUS.nativeAdapters}</p>
      </section>
      <BottomNav />
    </main>
  )
}
