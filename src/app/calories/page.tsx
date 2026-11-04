// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { IconByName } from '@/lib/icons'

export default function CaloriesPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [monthLogs, setMonthLogs] = useState({})
  const [selectedDay, setSelectedDay] = useState(null)
  const [dayLogs, setDayLogs] = useState([])
  const [today] = useState(new Date())
  const [viewMonth, setViewMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [viewMonth])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (prof) setProfile(prof)

    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).toISOString().slice(0, 10)
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).toISOString().slice(0, 10)

    const { data: logs } = await supabase.from('food_logs').select('logged_at,cal,protein,carb,fat,name').eq('user_id', user.id).gte('logged_at', firstDay).lte('logged_at', lastDay)

    const grouped = {}
    logs?.forEach(l => {
      if (!grouped[l.logged_at]) grouped[l.logged_at] = { cal: 0, protein: 0, carb: 0, fat: 0, items: [] }
      grouped[l.logged_at].cal += l.cal
      grouped[l.logged_at].protein += l.protein
      grouped[l.logged_at].carb += l.carb
      grouped[l.logged_at].fat += l.fat
      grouped[l.logged_at].items.push(l)
    })
    setMonthLogs(grouped)
    setLoading(false)
  }

  async function selectDay(dateStr) {
    setSelectedDay(dateStr)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('food_logs').select('*').eq('user_id', user.id).eq('logged_at', dateStr).order('created_at')
    setDayLogs(data || [])
  }

  function getDayColor(dateStr, cal) {
    if (!cal) return 'transparent'
    const target = profile?.cal_target || 1700
    const pct = cal / target
    if (pct < 0.5) return 'var(--blue-bg)'
    if (pct < 0.9) return 'var(--green-bg)'
    if (pct <= 1.15) return 'var(--green)'
    if (pct <= 1.3) return 'var(--border)'
    return 'var(--red-bg)'
  }

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay()
  const todayLogs = monthLogs[today.toISOString().slice(0, 10)]
  const calTarget = profile?.cal_target || 1700

  const monthAvgCal = Object.values(monthLogs).length > 0
    ? Math.round(Object.values(monthLogs).reduce((s, d) => s + d.cal, 0) / Object.values(monthLogs).length)
    : 0

  const daysOnTarget = Object.values(monthLogs).filter(d => d.cal >= calTarget * 0.85 && d.cal <= calTarget * 1.15).length

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 100 }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 12px) 20px 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Calorie History</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Tap any day to see what you ate</p>
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Today's ring */}
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--card2)" strokeWidth="8"/>
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={String(2 * Math.PI * 30)}
                strokeDashoffset={String(2 * Math.PI * 30 * (1 - Math.min(1, (todayLogs?.cal || 0) / calTarget)))}
                style={{ transformOrigin: '36px 36px', transform: 'rotate(-90deg)' }}/>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>{Math.round(todayLogs?.cal || 0)}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>kcal</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Today</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
              {Math.round(todayLogs?.cal || 0)} / {calTarget} kcal
            </div>
            <div style={{ marginTop: 8, height: 6, background: 'var(--card2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'var(--primary)', width: Math.min(100, ((todayLogs?.cal || 0) / calTarget) * 100) + '%', transition: 'width 0.6s' }}/>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {Math.max(0, calTarget - (todayLogs?.cal || 0))} kcal remaining
            </div>
          </div>
        </div>

        {/* Month stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Days logged', val: Object.keys(monthLogs).length, color: 'var(--primary)', icon: 'CalendarIcon' },
            { label: 'Avg calories', val: monthAvgCal, color: 'var(--green)', icon: 'FireIcon' },
            { label: 'On target', val: daysOnTarget, color: 'var(--orange)', icon: 'TargetIcon' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                <IconByName name={s.icon} size={20} color={s.color} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Calendar */}
        <div className="card" style={{ marginBottom: 16 }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {viewMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </div>
            <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={'e'+i}/>)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = viewMonth.getFullYear() + '-' + String(viewMonth.getMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0')
              const dayData = monthLogs[dateStr]
              const isToday = dateStr === today.toISOString().slice(0, 10)
              const isSelected = dateStr === selectedDay
              const isFuture = new Date(dateStr) > today
              const bgColor = getDayColor(dateStr, dayData?.cal)

              return (
                <button key={day} onClick={() => !isFuture && selectDay(dateStr)}
                  style={{
                    aspectRatio: '1', borderRadius: 10, border: isSelected ? '2px solid var(--primary)' : isToday ? '2px solid var(--primary)' : '2px solid transparent',
                    background: isSelected ? 'var(--primary)' : bgColor,
                    cursor: isFuture ? 'default' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                    opacity: isFuture ? 0.3 : 1, position: 'relative', padding: 0
                  }}>
                  <span style={{ fontSize: 12, fontWeight: isToday || isSelected ? 700 : 500, color: isSelected ? 'var(--colored-label)' : 'var(--text)' }}>{day}</span>
                  {dayData && <div style={{ width: 4, height: 4, borderRadius: '50%', background: isSelected ? 'var(--colored-label)' : 'var(--primary)', opacity: 0.8 }}/>}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {[{c:'var(--green)',l:'On target'},{c:'var(--border)',l:'Slightly over'},{c:'var(--red-bg)',l:'Over'},{c:'var(--blue-bg)',l:'Under 50%'}].map(x=>(
              <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div style={{ width:10, height:10, borderRadius:3, background:x.c }}/>
                <span style={{ fontSize:10, color:'var(--muted)' }}>{x.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected day detail */}
        {selectedDay && (
          <div className="card slide-up" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                {monthLogs[selectedDay] && (
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                    {Math.round(monthLogs[selectedDay].cal)} kcal · {Math.round(monthLogs[selectedDay].protein)}g protein
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>

            {dayLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>
                <div style={{ fontSize: 13 }}>Nothing logged this day</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--card2)', borderRadius: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{log.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {log.qty}{log.unit} · {Math.round(log.protein)}g P · {Math.round(log.carb)}g C
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>{Math.round(log.cal)} kcal</div>
                  </div>
                ))}
                {/* Day macros summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 4 }}>
                  {[
                    {l:'Cal',v:Math.round(monthLogs[selectedDay]?.cal||0),c:'var(--primary)'},
                    {l:'Protein',v:Math.round(monthLogs[selectedDay]?.protein||0),c:'var(--blue)'},
                    {l:'Carbs',v:Math.round(monthLogs[selectedDay]?.carb||0),c:'var(--orange)'},
                    {l:'Fat',v:Math.round(monthLogs[selectedDay]?.fat||0),c:'var(--red)'},
                  ].map(m=>(
                    <div key={m.l} style={{ background:'var(--card2)', borderRadius:10, padding:'8px 4px', textAlign:'center' }}>
                      <div style={{ fontSize:9, color:m.c, fontWeight:700, textTransform:'uppercase' }}>{m.l}</div>
                      <div style={{ fontSize:14, fontWeight:800, color:m.c, marginTop:2 }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  )
}
