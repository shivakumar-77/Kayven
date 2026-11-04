// @ts-nocheck
'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { FireIcon, ChartDownIcon, CalendarIcon, FoodIcon } from '@/lib/icons'

export default function SharePage() {
  const router = useRouter()
  const cardRef = useRef(null)
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({ streak: 0, weightLost: 0, totalLogs: 0, daysActive: 0, avgCal: 0 })
  const [copied, setCopied] = useState(false)
  const [theme, setTheme] = useState('caramel')
  const [downloading, setDownloading] = useState(false)

  const THEMES = {
    caramel: { from: 'var(--primary-dark)', to: 'var(--primary)', text: 'var(--primary-contrast)', accent: 'rgba(255,255,255,0.2)' },
    espresso: { from: 'var(--espresso)', to: 'var(--cocoa)', text: 'var(--on-dark-brand)', accent: 'rgba(255,255,255,0.1)' },
    taupe: { from: 'var(--primary)', to: 'var(--primary-light)', text: 'var(--primary-contrast)', accent: 'rgba(255,255,255,0.2)' },
    beige: { from: 'var(--beige)', to: 'var(--taupe)', text: 'var(--on-light-brand)', accent: 'rgba(26,18,14,0.1)' },
  }

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    const [{ data: prof }, { data: wlogs }, { data: flogs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('weight_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: true }),
      supabase.from('food_logs').select('logged_at,cal').eq('user_id', user.id).order('logged_at', { ascending: false }),
    ])
    if (prof) setProfile(prof)

    const weightLost = wlogs && wlogs.length >= 2
      ? Math.max(0, wlogs[0].weight_kg - wlogs[wlogs.length-1].weight_kg)
      : 0

    const uniqueDays = [...new Set(flogs?.map(l => l.logged_at) || [])].length
    const totalCal = flogs?.reduce((s, l) => s + l.cal, 0) || 0
    const avgCal = uniqueDays > 0 ? Math.round(totalCal / uniqueDays) : 0

    // Streak
    const sortedDates = [...new Set(flogs?.map(l => l.logged_at) || [])].sort((a,b) => b.localeCompare(a))
    let streak = 0
    if (sortedDates.length > 0) {
      let d = new Date()
      const set = new Set(sortedDates)
      while (set.has(d.toISOString().slice(0,10))) { streak++; d.setDate(d.getDate()-1) }
    }

    setStats({ streak, weightLost: parseFloat(weightLost.toFixed(1)), totalLogs: flogs?.length || 0, daysActive: uniqueDays, avgCal })
  }

  const t = THEMES[theme]

  async function downloadCard() {
    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(cardRef.current, { scale: 3, backgroundColor: null, useCORS: true })
      const link = document.createElement('a')
      link.download = 'kayven-progress.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      // Fallback if html2canvas not available
      alert('Install html2canvas: npm install html2canvas')
    }
    setDownloading(false)
  }

  async function copyLink() {
    await navigator.clipboard.writeText('I am tracking my nutrition with Kayven! 💪 Kayven-gamma.vercel.app')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const joinDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : ''

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top,0px) + 12px) 20px 16px' }}>
        <button onClick={() => router.back()} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--card)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Share Progress</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Download your progress card</p>
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Theme picker */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Choose card theme</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {Object.entries(THEMES).map(([key, val]) => (
              <button key={key} onClick={() => setTheme(key)}
                style={{ flex: 1, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,' + val.from + ',' + val.to + ')', border: theme === key ? '3px solid var(--text)' : '3px solid transparent', cursor: 'pointer', transition: 'border 0.15s' }}/>
            ))}
          </div>
        </div>

        {/* Progress card — this is what gets downloaded */}
        <div ref={cardRef} style={{
          background: 'linear-gradient(135deg,' + t.from + ',' + t.to + ')',
          borderRadius: 24, padding: '28px 24px', marginBottom: 16,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.text, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Kayven</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.text }}>{profile?.name ? 'My Progress' : 'Progress Card'}</div>
              {profile?.name && <div style={{ fontSize: 14, color: t.text, opacity: 0.8, marginTop: 2 }}>{profile.name}</div>}
            </div>
            <div style={{ fontSize: 40 }}>🏆</div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[
              { Icon: FireIcon, label: 'Day streak', val: stats.streak, unit: 'days' },
              { Icon: ChartDownIcon, label: 'Weight lost', val: stats.weightLost, unit: 'kg' },
              { Icon: CalendarIcon, label: 'Days active', val: stats.daysActive, unit: 'days' },
              { Icon: FoodIcon, label: 'Meals logged', val: stats.totalLogs, unit: 'total' },
            ].map(s => (
              <div key={s.label} style={{ background: t.accent, borderRadius: 16, padding: '16px 14px' }}>
                <div style={{ fontSize: 22, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.Icon size={22} color={t.text} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: t.text }}>{s.val}</div>
                <div style={{ fontSize: 11, color: t.text, opacity: 0.75, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Goal badge */}
          <div style={{ background: t.accent, borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: t.text, opacity: 0.7, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current goal</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginTop: 2 }}>
                {profile?.goal === 'lose' ? '📉 Fat Loss' : profile?.goal === 'gain' ? '💪 Muscle Gain' : '⚖️ Maintain Weight'}
              </div>
            </div>
            {stats.avgCal > 0 && <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: t.text, opacity: 0.7, fontWeight: 600 }}>Avg daily</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{stats.avgCal} kcal</div>
            </div>}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: t.text, opacity: 0.6 }}>Kayven.app · {new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary" style={{ width: '100%', padding: '15px', fontWeight: 700, fontSize: 15 }} onClick={downloadCard} disabled={downloading}>
            {downloading ? 'Generating…' : '📥 Download as image'}
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', padding: '14px', fontWeight: 600 }} onClick={copyLink}>
            {copied ? '✓ Copied!' : '🔗 Copy app link'}
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', padding: '14px', fontWeight: 600 }}
            onClick={() => { const t = 'I am tracking my nutrition with Kayven! 💪 Check it out: Kayven.app'; window.open('https://wa.me/?text=' + encodeURIComponent(t)) }}>
            💬 Share on WhatsApp
          </button>
        </div>

        <div style={{ background: 'var(--orange-bg)', borderRadius: 14, padding: '12px 16px', border: '1.5px solid var(--border)', marginTop: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--orange)', lineHeight: 1.6 }}>💡 To download as image, run: <code style={{ background: 'var(--border)', padding: '1px 6px', borderRadius: 4 }}>npm install html2canvas</code> in your project then redeploy.</p>
        </div>
      </div>
      <BottomNav/>
    </div>
  )
}
