'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { invalidateDashboardSnapshot } from '@/lib/dashboard-cache'

const PRESETS = [100, 150, 200, 250, 300, 350, 400, 500, 750, 1000]

export default function WaterPage() {
  const router = useRouter()
  const [waterGoal, setWaterGoal] = useState(2000)
  const [todayMl, setTodayMl] = useState(0)
  const [logs, setLogs] = useState([])
  const [selectedMl, setSelectedMl] = useState(250)
  const [customMl, setCustomMl] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [calMonth, setCalMonth] = useState(new Date())
  const [calData, setCalData] = useState({})
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth'); return }
      setUserId(user.id)
      const { data: prof } = await supabase.from('profiles').select('water_goal').eq('id', user.id).single()
      if (prof?.water_goal) setWaterGoal(prof.water_goal)
      await loadToday(user.id)
      await loadCalendar(user.id, new Date())
    }
    load()
  }, [])

  async function loadToday(uid) {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('water_logs').select('*').eq('user_id', uid).eq('logged_at', today).order('created_at')
    if (data) { setLogs(data); setTodayMl(data.reduce((s, l) => s + l.amount_ml, 0)) }
  }

  async function loadCalendar(uid, month) {
    const year = month.getFullYear(), m = month.getMonth()
    const start = new Date(year, m, 1).toISOString().slice(0, 10)
    const end = new Date(year, m + 1, 0).toISOString().slice(0, 10)
    const { data } = await supabase.from('water_logs').select('logged_at, amount_ml').eq('user_id', uid).gte('logged_at', start).lte('logged_at', end)
    if (data) {
      const grouped = {}
      data.forEach(l => { grouped[l.logged_at] = (grouped[l.logged_at] || 0) + l.amount_ml })
      setCalData(grouped)
    }
  }

  async function addWater(ml) {
    if (!userId) return
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('water_logs').insert({ user_id: userId, logged_at: today, amount_ml: ml })
    invalidateDashboardSnapshot(userId)
    setTodayMl(prev => prev + ml)
    setLogs(prev => [...prev, { amount_ml: ml, created_at: new Date().toISOString() }])
    setCalData(prev => ({ ...prev, [today]: (prev[today] || 0) + ml }))
    setShowCustom(false); setCustomMl('')
  }

  async function changeMonth(dir) {
    const newMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + dir, 1)
    setCalMonth(newMonth)
    if (userId) await loadCalendar(userId, newMonth)
  }

  const pct = Math.min(1, todayMl / waterGoal)
  const reached = todayMl >= waterGoal
  const wc = reached ? '#10b981' : '#3b82f6'
  const wl = reached ? '#34d399' : '#60a5fa'
  const GW = 180, GH = 260
  const fillH = Math.round((GH - 20) * pct)
  const fillY = GH - 10 - fillH

  const year = calMonth.getFullYear(), month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const blanks = firstDay === 0 ? 6 : firstDay - 1

  function getDayColor(dateStr) {
    const amt = calData[dateStr] || 0
    if (!amt) return null
    const p = amt / waterGoal
    if (p >= 1) return '#10b981'
    if (p >= 0.6) return '#3b82f6'
    if (p >= 0.3) return '#93c5fd'
    return '#dbeafe'
  }

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '52px 20px 20px' }}>
        <button onClick={() => router.back()} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--card)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Hydration</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px 24px' }}>
        <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 20 }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="10"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke={wc} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${2*Math.PI*50}`} strokeDashoffset={2*Math.PI*50*(1-pct)}
              style={{ transformOrigin:'60px 60px', transform:'rotate(-90deg)', transition:'stroke-dashoffset 0.8s ease' }}/>
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: wc }}>{Math.round(pct*100)}%</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform:'uppercase', textAlign:'center', lineHeight:1.3 }}>Today's<br/>Hydration</div>
          </div>
        </div>

        <svg width={GW} height={GH} viewBox={`0 0 ${GW} ${GH}`}>
          <defs>
            <clipPath id="cup-clip">
              <path d={`M20 10 L10 ${GH-10} Q10 ${GH} 20 ${GH} L${GW-20} ${GH} Q${GW-10} ${GH} ${GW-10} ${GH-10} L${GW-20} 10 Z`}/>
            </clipPath>
          </defs>
          <path d={`M20 10 L10 ${GH-10} Q10 ${GH} 20 ${GH} L${GW-20} ${GH} Q${GW-10} ${GH} ${GW-10} ${GH-10} L${GW-20} 10 Z`} fill="#f0f4ff" stroke="#e2e8f0" strokeWidth="2"/>
          <g clipPath="url(#cup-clip)">
            {pct > 0 && <>
              <rect x="10" y={fillY+10} width={GW-20} height={Math.max(0,fillH)} fill={wc} opacity="0.75"
                style={{ transition:'y 0.8s cubic-bezier(0.34,1.4,0.64,1),height 0.8s cubic-bezier(0.34,1.4,0.64,1)' }}/>
              <ellipse cx={GW/2} cy={fillY+10} rx={GW/2-10} ry="10" fill={wl} opacity="0.9"
                style={{ transition:'cy 0.8s cubic-bezier(0.34,1.4,0.64,1)', animation:'wv 2.5s ease-in-out infinite' }}/>
              {pct > 0.15 && <>
                <circle cx="50" cy={fillY+60} r="5" fill="rgba(255,255,255,0.3)" style={{ animation:'b1 2.2s ease-in-out infinite' }}/>
                <circle cx="120" cy={fillY+100} r="4" fill="rgba(255,255,255,0.25)" style={{ animation:'b2 3s ease-in-out infinite 0.8s' }}/>
                <circle cx="80" cy={fillY+150} r="3" fill="rgba(255,255,255,0.2)" style={{ animation:'b1 3.5s ease-in-out infinite 1.5s' }}/>
              </>}
              {pct > 0.1 && <text x={GW/2} y={fillY+Math.max(35,fillH/2+10)} textAnchor="middle" fontSize="24" fontWeight="800" fill="white" opacity="0.95">{todayMl}ml</text>}
            </>}
          </g>
          <path d={`M20 10 L10 ${GH-10} Q10 ${GH} 20 ${GH} L${GW-20} ${GH} Q${GW-10} ${GH} ${GW-10} ${GH-10} L${GW-20} 10 Z`} fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="2"/>
          <path d="M35 20 L28 100" stroke="rgba(255,255,255,0.6)" strokeWidth="5" strokeLinecap="round"/>
        </svg>

        <div style={{ fontSize: 14, color: reached ? '#10b981' : 'var(--muted)', fontWeight: 600, marginTop: 12 }}>
          {reached ? '🎉 Daily goal reached!' : `${waterGoal - todayMl}ml remaining`}
        </div>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, textAlign: 'center' }}>Select amount</div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
          {PRESETS.map(ml => (
            <button key={ml} onClick={() => setSelectedMl(ml)}
              style={{ flexShrink: 0, padding: '12px 18px', borderRadius: 16, border: `2px solid ${selectedMl===ml?wc:'var(--border)'}`, background: selectedMl===ml?`${wc}18`:'var(--card)', color: selectedMl===ml?wc:'var(--muted)', fontWeight: 700, fontSize: 15, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{ml}</span>
              <span style={{ fontSize: 10 }}>ml</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 20px 16px' }}>
        <button onClick={() => addWater(selectedMl)}
          style={{ width: '100%', padding: '17px', borderRadius: 20, background: wc, color: '#fff', fontSize: 17, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: `0 6px 20px ${wc}40` }}>
          + WATER ({selectedMl}ml)
        </button>
      </div>

      <div style={{ padding: '0 20px 24px', display: 'flex', justifyContent: 'center' }}>
        {!showCustom ? (
          <button onClick={() => setShowCustom(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Add custom amount
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 280 }}>
            <input type="number" placeholder="e.g. 330ml" value={customMl} onChange={e => setCustomMl(e.target.value)}
              onKeyDown={e => e.key==='Enter' && parseInt(customMl)>0 && addWater(parseInt(customMl))}
              style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 16 }} autoFocus/>
            <button onClick={() => parseInt(customMl)>0 && addWater(parseInt(customMl))}
              style={{ padding: '12px 18px', borderRadius: 14, background: wc, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Add</button>
            <button onClick={() => { setShowCustom(false); setCustomMl('') }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
          </div>
        )}
      </div>

      {logs.length > 0 && (
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Today's log</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...logs].reverse().map((l, i) => (
              <div key={i} style={{ padding: '5px 12px', borderRadius: 99, background: `${wc}15`, color: wc, fontSize: 12, fontWeight: 700 }}>+{l.amount_ml}ml</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <button onClick={() => changeMonth(-1)} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card2)', border: '1.5px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
            <button onClick={() => changeMonth(1)} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card2)', border: '1.5px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
            {['M','T','W','T','F','S','S'].map((d,i) => <div key={i} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--muted)' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {Array(blanks).fill(null).map((_,i) => <div key={`b${i}`}/>)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day = i+1
              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const amt = calData[dateStr] || 0
              const bg = getDayColor(dateStr)
              const isToday = dateStr === today
              return (
                <div key={day} style={{ aspectRatio:'1', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:bg||(isToday?'var(--primary-bg)':'transparent'), border:isToday?`2px solid ${wc}`:'2px solid transparent' }}>
                  <div style={{ fontSize:12, fontWeight:isToday?800:600, color:bg?'#fff':isToday?wc:'var(--text)' }}>{day}</div>
                  {amt>0 && <div style={{ fontSize:8, fontWeight:700, color:bg?'rgba(255,255,255,0.85)':wc }}>{amt>=1000?`${(amt/1000).toFixed(1)}L`:amt}</div>}
                </div>
              )
            })}
          </div>
          <div style={{ display:'flex', gap:10, marginTop:16, justifyContent:'center', flexWrap:'wrap' }}>
            {[{c:'#10b981',l:'Goal met'},{c:'#3b82f6',l:'60%+'},{c:'#93c5fd',l:'30%+'},{c:'#dbeafe',l:'Started'}].map(l=>(
              <div key={l.l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:10, height:10, borderRadius:3, background:l.c }}/>
                <span style={{ fontSize:10, color:'var(--muted)', fontWeight:500 }}>{l.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes wv{0%,100%{ry:10px}50%{ry:7px}} @keyframes b1{0%,100%{transform:translateY(0);opacity:.3}50%{transform:translateY(-12px);opacity:.7}} @keyframes b2{0%,100%{transform:translateY(0);opacity:.2}50%{transform:translateY(-10px);opacity:.55}}`}</style>
    </div>
  )
}
