'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'

type SleepLog = {
  id: string
  sleep_date: string
  started_at: string
  ended_at: string
  duration_minutes: number
}

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export default function SleepPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [logs, setLogs] = useState<SleepLog[]>([])
  const [sleepDate, setSleepDate] = useState(localDateString())
  const [bedtime, setBedtime] = useState('22:30')
  const [wakeTime, setWakeTime] = useState('06:30')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const loadLogs = useCallback(async (uid: string) => {
    const { data, error: queryError } = await supabase
      .from('sleep_logs')
      .select('id, sleep_date, started_at, ended_at, duration_minutes')
      .eq('user_id', uid)
      .order('sleep_date', { ascending: false })
      .limit(14)

    if (queryError) throw queryError
    setLogs(data ?? [])
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!user) {
          router.replace('/auth')
          return
        }
        if (!active) return
        setUserId(user.id)
        await loadLogs(user.id)
      } catch (loadError) {
        console.error('[Sleep] Failed to load sleep history', loadError)
        if (active) setError('Could not load sleep history. Please retry.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [loadLogs, router])

  async function saveSleep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) {
      setError('Please sign in again before saving sleep.')
      return
    }
    if (!sleepDate || !bedtime || !wakeTime || bedtime === wakeTime) {
      setError('Choose a sleep date, bedtime, and a different wake-up time.')
      return
    }

    const end = new Date(`${sleepDate}T${wakeTime}:00`)
    const startDate = new Date(`${sleepDate}T00:00:00`)
    if (bedtime >= wakeTime) startDate.setDate(startDate.getDate() - 1)
    const start = new Date(`${localDateString(startDate)}T${bedtime}:00`)
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000)

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
      setError('The selected sleep and wake times are not valid.')
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const { data: inserted, error: insertError } = await supabase
        .from('sleep_logs')
        .insert({
          user_id: userId,
          sleep_date: sleepDate,
          started_at: start.toISOString(),
          ended_at: end.toISOString(),
          duration_minutes: durationMinutes,
        })
        .select('id, sleep_date, started_at, ended_at, duration_minutes')
        .single()
      if (insertError) throw insertError
      setLogs(previous => [inserted, ...previous.filter(log => log.id !== inserted.id)].slice(0, 14))
      setSaved(true)
    } catch (saveError) {
      console.error('[Sleep] Failed to save sleep log', saveError)
      setError('Sleep was not saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--surface)', padding: 'calc(env(safe-area-inset-top, 0px) + 28px) 20px calc(110px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto' }}>
        <p style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', marginBottom: 7 }}>RECOVERY</p>
        <h1 style={{ color: 'var(--text)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em' }}>Log sleep</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, marginTop: 8, marginBottom: 22 }}>
          Record when you went to bed and woke up. Times are saved in your local time zone.
        </p>

        <form onSubmit={saveSleep} style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 22, background: 'var(--card)', boxShadow: 'var(--shadow-sm)' }}>
          <label style={{ display: 'block', color: 'var(--text-2)', fontSize: 13, fontWeight: 650, marginBottom: 14 }}>
            Wake-up date
            <input
              type="date"
              value={sleepDate}
              max={localDateString()}
              onChange={event => setSleepDate(event.target.value)}
              required
              style={{ display: 'block', width: '100%', marginTop: 7, padding: '12px 13px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <label style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 650 }}>
              Bedtime
              <input
                type="time"
                value={bedtime}
                onChange={event => setBedtime(event.target.value)}
                required
                style={{ display: 'block', width: '100%', marginTop: 7, padding: '12px 10px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' }}
              />
            </label>
            <label style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 650 }}>
              Wake-up time
              <input
                type="time"
                value={wakeTime}
                onChange={event => setWakeTime(event.target.value)}
                required
                style={{ display: 'block', width: '100%', marginTop: 7, padding: '12px 10px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' }}
              />
            </label>
          </div>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13, lineHeight: 1.45, marginTop: 14 }}>{error}</p>}
          {saved && <p role="status" style={{ color: 'var(--green)', fontSize: 13, marginTop: 14 }}>Sleep log saved.</p>}
          <button
            type="submit"
            disabled={saving || loading}
            style={{ width: '100%', marginTop: 18, padding: 14, border: 0, borderRadius: 14, background: 'var(--primary)', color: '#fff', font: 'inherit', fontWeight: 750, cursor: saving || loading ? 'wait' : 'pointer', opacity: saving || loading ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save sleep'}
          </button>
        </form>

        <section aria-labelledby="sleep-history-title" style={{ marginTop: 28 }}>
          <h2 id="sleep-history-title" style={{ color: 'var(--text)', fontSize: 18, fontWeight: 750, marginBottom: 12 }}>Recent sleep</h2>
          {loading ? (
            <p role="status" style={{ color: 'var(--muted)', fontSize: 14 }}>Loading sleep history…</p>
          ) : error && logs.length === 0 ? (
            <button type="button" onClick={() => userId && void loadLogs(userId).then(() => setError(null)).catch(loadError => {
              console.error('[Sleep] Retry failed', loadError)
              setError('Could not load sleep history. Please try again.')
            })} style={{ padding: '10px 13px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)', color: 'var(--text)', font: 'inherit', cursor: 'pointer' }}>
              Retry loading history
            </button>
          ) : logs.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Your sleep logs will appear here.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 9, padding: 0, listStyle: 'none' }}>
              {logs.map(log => (
                <li key={log.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '14px 15px', border: '1px solid var(--border)', borderRadius: 15, background: 'var(--card)' }}>
                  <span style={{ color: 'var(--text-2)', fontSize: 14 }}>{new Date(`${log.sleep_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <strong style={{ color: 'var(--text)', fontSize: 14 }}>{durationLabel(log.duration_minutes)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <BottomNav />
    </main>
  )
}
