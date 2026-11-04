'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { IconByName } from '@/lib/icons'

const DEFAULT_REMINDERS = [
  { id: 'breakfast', label: 'Breakfast reminder', icon: 'SunriseIcon', time: '08:00', enabled: true, url: '/log' },
  { id: 'lunch', label: 'Lunch reminder', icon: 'SunIcon', time: '13:00', enabled: true, url: '/log' },
  { id: 'dinner', label: 'Dinner reminder', icon: 'MoonIcon', time: '20:00', enabled: true, url: '/log' },
  { id: 'water', label: 'Water reminder', icon: 'DropletIcon', time: '10:00', enabled: false, url: '/water' },
  { id: 'water2', label: 'Water reminder 2', icon: 'DropletIcon', time: '15:00', enabled: false, url: '/water' },
  { id: 'weight', label: 'Weight log reminder', icon: 'ScaleIcon', time: '07:00', enabled: false, url: '/profile' },
]

export default function NotificationsPage() {
  const router = useRouter()
  const [permission, setPermission] = useState('default')
  const [reminders, setReminders] = useState(DEFAULT_REMINDERS)
  const [msg, setMsg] = useState('')
  const [swReady, setSwReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPermission(Notification.permission)
    const saved = localStorage.getItem('Kayven_reminders')
    if (saved) { try { setReminders(JSON.parse(saved)) } catch {} }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setSwReady(true))
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  async function requestPermission() {
    const p = await Notification.requestPermission()
    setPermission(p)
    if (p === 'granted') {
      new Notification('Kayven 🎉', { body: 'Notifications enabled! We will remind you to stay on track.' })
      showMsg('Notifications enabled!')
      registerSW()
    } else {
      showMsg('Please allow notifications in your browser settings.')
    }
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await reg.update()
      setSwReady(true)
    } catch (e) { console.error('SW reg failed', e) }
  }

  function showMsg(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  function toggleReminder(id) {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  function updateTime(id, time) {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, time } : r))
  }

  async function saveAndSchedule() {
    setSaving(true)
    localStorage.setItem('Kayven_reminders', JSON.stringify(reminders))

    if (permission !== 'granted') {
      showMsg('Please enable notifications first')
      setSaving(false)
      return
    }

    // Schedule via setInterval checks — fire notification if time matches
    scheduleLocalNotifications(reminders)
    showMsg('Reminders saved!')
    setSaving(false)
  }

  function scheduleLocalNotifications(rems) {
    // Clear existing
    const win = window as any
    if (win._notifInterval) clearInterval(win._notifInterval)

    const enabled = rems.filter(r => r.enabled)
    if (!enabled.length) return

    const fired = new Set()

    win._notifInterval = setInterval(() => {
      const now = new Date()
      const hhmm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')
      enabled.forEach(r => {
        const key = r.id + '-' + hhmm
        if (r.time === hhmm && !fired.has(key)) {
          fired.add(key)
          new Notification(r.label + ' — Kayven', {
            body: r.id.includes('water') ? 'Time to hydrate! 💧 Stay on track with your water goal.' :
                  r.id === 'weight' ? 'Log your weight today to track your progress! ⚖️' :
                  'Time to log your ' + r.label.toLowerCase().replace(' reminder','') + '! 🍽️',
            icon: '/Kayven.PNG',
          })
          // Clean old fired after 2 min
          setTimeout(() => fired.delete(key), 120000)
        }
      })
    }, 30000) // check every 30s
  }

  async function sendTestNotification() {
    if (permission !== 'granted') { await requestPermission(); return }
    new Notification('Kayven Test 🔔', {
      body: 'Notifications are working! You will get reminders at your set times.',
      icon: '/Kayven.PNG',
    })
    showMsg('Test notification sent!')
  }

  const enabledCount = reminders.filter(r => r.enabled).length

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top,0px) + 12px) 20px 16px' }}>
        <button onClick={() => router.back()} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--card)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Notifications</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Meal & hydration reminders</p>
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {msg && <div style={{ background: 'var(--green-bg)', border: '1.5px solid var(--green)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>✓ {msg}</div>}

        {/* Permission card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: permission === 'granted' ? 'var(--green-bg)' : 'var(--orange-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {permission === 'granted' ? <IconByName name="CheckIcon" size={22} color="var(--green)" /> : <IconByName name="BellIcon" size={22} color="var(--orange)" />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {permission === 'granted' ? 'Notifications active' : 'Enable notifications'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {permission === 'granted' ? enabledCount + ' reminder' + (enabledCount !== 1 ? 's' : '') + ' scheduled' : 'Allow Kayven to send meal reminders'}
              </div>
            </div>
          </div>

          {permission !== 'granted' ? (
            <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontWeight: 700 }} onClick={requestPermission}>
              🔔 Enable notifications
            </button>
          ) : (
            <button className="btn btn-ghost" style={{ width: '100%', padding: '13px', fontWeight: 600, fontSize: 13 }} onClick={sendTestNotification}>
              Send test notification
            </button>
          )}
        </div>

        {/* Reminders */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Reminder schedule</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {reminders.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: i < reminders.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: r.enabled ? 'var(--primary-bg)' : 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
                  <IconByName name={r.icon} size={20} color={r.enabled ? 'var(--primary)' : 'var(--muted)'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: r.enabled ? 'var(--text)' : 'var(--muted)' }}>{r.label}</div>
                  <input type="time" value={r.time} onChange={e => updateTime(r.id, e.target.value)}
                    disabled={!r.enabled}
                    style={{ fontSize: 12, color: r.enabled ? 'var(--primary)' : 'var(--muted)', fontWeight: 700, background: 'none', border: 'none', padding: 0, marginTop: 2, cursor: r.enabled ? 'pointer' : 'default', outline: 'none' }}/>
                </div>
                {/* Toggle switch */}
                <button onClick={() => toggleReminder(r.id)}
                  style={{ width: 48, height: 28, borderRadius: 99, background: r.enabled ? 'var(--primary)' : 'var(--border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 4, left: r.enabled ? 24 : 4, width: 20, height: 20, borderRadius: '50%', background: 'var(--card)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '15px', fontWeight: 700, fontSize: 15, marginBottom: 12 }} onClick={saveAndSchedule} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save reminders'}
        </button>

        <div style={{ background: 'var(--green-bg)', borderRadius: 16, padding: '14px 16px', border: '1.5px solid var(--border)' }}>
          <p style={{ fontSize: 12, color: 'var(--green)', lineHeight: 1.7 }}>
            ⚠️ Reminders only fire while the app is open in your browser or installed as a PWA. For persistent notifications, add Kayven to your home screen.
          </p>
        </div>
      </div>
      <BottomNav/>
    </div>
  )
}
