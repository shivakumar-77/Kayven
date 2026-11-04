// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { PageLoader } from '@/components/Skeleton'
import { ScaleIcon, TargetIcon, TrophyIcon, ChartDownIcon, ChartUpIcon, ChartBarIcon } from '@/lib/icons'

function toISO(d) { return d.toISOString().slice(0, 10) }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r }
function fmtDate(d, opts) { return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', opts) }

// ── small inline icons (kept local — no new icon-library dependency) ────────
const IconX = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
)
const IconPlus = ({ size = 22, color = 'var(--colored-label)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)
const IconCheck = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--primary-contrast)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
)
const IconDroplet = ({ size = 20, color = 'var(--primary)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5s6.5 7.4 6.5 12A6.5 6.5 0 1 1 5.5 14.5C5.5 9.9 12 2.5 12 2.5Z" /></svg>
)
const IconMuscle = ({ size = 20, color = 'var(--primary)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M6.5 12h11" /><rect x="4" y="8" width="3" height="8" rx="1" /><rect x="17" y="8" width="3" height="8" rx="1" /></svg>
)
const IconCamera = ({ size = 20, color = 'var(--primary)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" /><circle cx="12" cy="13" r="4" /></svg>
)
const IconRuler = ({ size = 20, color = 'var(--primary)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="20" height="8" rx="1.5" /><path d="M6 8v3M10 8v3M14 8v3M18 8v3" /></svg>
)
const IconChevronRight = ({ size = 16, color = 'var(--muted)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
)

export default function WeightPage() {
  const router = useRouter()
  const [logs, setLogs]           = useState([])
  const [profile, setProfile]     = useState(null)
  const [input, setInput]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')
  const [chartView, setChartView] = useState('month')
  const [calMonth, setCalMonth]   = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [showLogSheet, setShowLogSheet] = useState(false)
  const [platform, setPlatform]   = useState('ios')
  const today = toISO(new Date())

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent || ''
    if (/Android/i.test(ua)) setPlatform('android')
    else if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios')
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    const [{ data: prof }, { data: wlogs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('weight_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: true })
    ])
    if (prof) setProfile(prof)
    if (wlogs) setLogs(wlogs)
  }

  async function logWeight() {
    const val = parseFloat(input)
    if (!val || val < 20 || val > 300) { showMsg('Enter a valid weight (20–300 kg)'); return }
    setSaving(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) { router.replace('/auth'); return }
      const { data, error } = await supabase.from('weight_logs').upsert(
        { user_id: user.id, logged_at: today, weight_kg: val },
        { onConflict: 'user_id,logged_at' }
      ).select().single()
      if (error) throw error
      setLogs(previous => [...previous.filter(log => log.logged_at !== today), data]
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at)))
      setInput('')
      showMsg('Logged!')
    } catch (error) {
      console.error('[Weight] Failed to save weight log', error)
      showMsg('Could not log weight. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteLog(id) {
    await supabase.from('weight_logs').delete().eq('id', id)
    setLogs(p => p.filter(l => l.id !== id))
  }

  function showMsg(m) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const sorted   = [...logs].sort((a, b) => a.logged_at.localeCompare(b.logged_at))
  const latest   = sorted[sorted.length - 1]
  const first    = sorted[0]
  const goal     = profile?.weight_goal ?? 75
  const totalChg = sorted.length >= 2 ? parseFloat((latest.weight_kg - first.weight_kg).toFixed(1)) : null
  const toGoal   = latest ? parseFloat((latest.weight_kg - goal).toFixed(1)) : null
  const isLosing = totalChg < 0
  const last7    = sorted.filter(l => l.logged_at >= toISO(addDays(new Date(), -6)))
  const weekAvg  = last7.length ? (last7.reduce((s,l)=>s+l.weight_kg,0)/last7.length).toFixed(1) : null
  const weekChg  = last7.length >= 2 ? parseFloat((last7[last7.length-1].weight_kg - last7[0].weight_kg).toFixed(1)) : null
  const height   = profile?.height
  const bmiVal   = latest && height ? parseFloat((latest.weight_kg/((height/100)**2)).toFixed(1)) : null
  const bmiCat   = bmiVal ? bmiVal < 18.5 ? 'Underweight' : bmiVal < 25 ? 'Normal' : bmiVal < 30 ? 'Overweight' : 'Obese' : null
  const bmiColor = bmiVal ? bmiVal < 18.5 ? 'var(--blue)' : bmiVal < 25 ? 'var(--green)' : bmiVal < 30 ? 'var(--orange)' : 'var(--red)' : 'var(--primary)'
  const isAndroid = platform === 'android'

  function getChartData() {
    if (chartView === 'week')  return sorted.filter(l => l.logged_at >= toISO(addDays(new Date(), -6)))
    if (chartView === 'month') return sorted.filter(l => l.logged_at >= toISO(addDays(new Date(), -29)))
    if (chartView === 'year')  return sorted.filter(l => l.logged_at >= toISO(addDays(new Date(), -364)))
    return sorted
  }
  const chartData = getChartData()

  function LineChart({ data }) {
    if (data.length < 2) return (
      <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
        <ChartBarIcon size={28} color="var(--muted)"/>
        <div style={{ fontSize:13 }}>Log at least 2 entries</div>
      </div>
    )
    const W=340, H=160, PAD=4
    const vals = data.map(d => d.weight_kg)
    const min  = Math.min(...vals), max = Math.max(...vals)
    const range = max - min || 1
    const px = i => PAD + (i / (data.length-1)) * (W - PAD*2)
    const py = v => H - PAD - ((v-min)/range) * (H - PAD*2 - 20)
    const pts = data.map((d,i) => ({ x:px(i), y:py(d.weight_kg), d }))
    const smooth = pts.map((p,i) => {
      if (i===0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
      const prev = pts[i-1]
      const cpx = (prev.x + p.x) / 2
      return `C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
    }).join(' ')
    const fill = `${smooth} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`
    const lc   = totalChg !== null && totalChg <= 0 ? 'var(--green)' : 'var(--red)'
    const yTicks = [min, (min+max)/2, max].map(v => ({ val:v.toFixed(1), y:py(v) }))

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H+26}`} style={{ overflow:'visible' }}>
        <defs>
          <linearGradient id="lf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lc} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={lc} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {yTicks.map((t,i) => (
          <g key={i}>
            <line x1={PAD} y1={t.y} x2={W-PAD} y2={t.y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4"/>
            <text x={W-PAD+4} y={t.y+4} fontSize="8" fill="var(--muted)">{t.val}</text>
          </g>
        ))}
        {goal && min <= goal && goal <= max+2 && (
          <g>
            <line x1={PAD} y1={py(goal)} x2={W-PAD} y2={py(goal)} stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="5,4"/>
            <text x={PAD+2} y={py(goal)-4} fontSize="8" fill="var(--primary)">Goal {goal}kg</text>
          </g>
        )}
        <path d={fill} fill="url(#lf)"/>
        <path d={smooth} fill="none" stroke={lc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i) => {
          const v = p.d.weight_kg
          const isFirst = i===0, isLast = i===pts.length-1
          const isMin = v===Math.min(...vals), isMax = v===Math.max(...vals)
          if (!isFirst && !isLast && !isMin && !isMax) return null
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="5" fill={lc} stroke="var(--primary-contrast)" strokeWidth="2"/>
              {(isFirst||isLast) && <text x={p.x} y={p.y-10} textAnchor={isFirst?'start':'end'} fontSize="9.5" fontWeight="700" fill={lc}>{v}</text>}
              {(isMin||isMax) && !isFirst && !isLast && <text x={p.x} y={isMin?p.y+16:p.y-10} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={lc}>{v}</text>}
            </g>
          )
        })}
        {pts.filter((_,i) => i===0||i===pts.length-1||i%Math.max(1,Math.ceil(data.length/5))===0).map((p,i)=>(
          <text key={i} x={p.x} y={H+18} textAnchor="middle" fontSize="8" fill="var(--muted)">
            {fmtDate(p.d.logged_at,{month:'short',day:'numeric'})}
          </text>
        ))}
      </svg>
    )
  }

  function BarChart() {
    const weeks = []
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(addDays(new Date(), -i*7))
      const we = addDays(ws, 6)
      const inW = sorted.filter(l => l.logged_at >= toISO(ws) && l.logged_at <= toISO(we))
      const avg = inW.length ? parseFloat((inW.reduce((s,l)=>s+l.weight_kg,0)/inW.length).toFixed(1)) : null
      weeks.push({ label: ws.toLocaleDateString('en-IN',{month:'short',day:'numeric'}), avg, count: inW.length })
    }
    const valid = weeks.filter(w => w.avg !== null)
    if (valid.length < 2) return (
      <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:13 }}>Log more entries to see weekly trends</div>
    )
    const vals = valid.map(w => w.avg)
    const minV = Math.min(...vals) - 0.5
    const maxV = Math.max(...vals) + 0.5
    const W=340, H=140
    const bw = (W/weeks.length) - 5

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H+32}`} style={{ overflow:'visible' }}>
        {[0,0.5,1].map((t,i) => {
          const y = H - t*H
          const v = (minV + t*(maxV-minV)).toFixed(1)
          return (
            <g key={i}>
              <line x1="0" y1={y} x2={W} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3"/>
              <text x={W+2} y={y+4} fontSize="7.5" fill="var(--muted)">{v}</text>
            </g>
          )
        })}
        {goal && minV <= goal && goal <= maxV && (
          <line x1="0" y1={H-((goal-minV)/(maxV-minV))*H} x2={W} y2={H-((goal-minV)/(maxV-minV))*H}
            stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="5,3"/>
        )}
        {weeks.map((w,i) => {
          const x    = i*(W/weeks.length)+3
          const barH = w.avg ? Math.max(4,((w.avg-minV)/(maxV-minV))*H) : 0
          const y    = H - barH
          const prev = weeks.slice(0,i).reverse().find(x => x.avg!==null)
          const going = prev && w.avg ? w.avg - prev.avg : 0
          const color = !w.avg ? 'var(--border)' : going < -0.05 ? 'var(--green)' : going > 0.05 ? 'var(--red)' : 'var(--primary)'
          const isLatest = i === weeks.length-1
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={barH} rx="5" fill={color} opacity={isLatest?1:0.6}/>
              {w.avg && <text x={x+bw/2} y={y-5} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={color}>{w.avg}</text>}
              <text x={x+bw/2} y={H+14} textAnchor="middle" fontSize="7.5" fill="var(--muted)">{w.label.split(' ')[0]}</text>
              {w.count>0 && <text x={x+bw/2} y={H+24} textAnchor="middle" fontSize="7" fill="var(--muted)">{w.count}d</text>}
            </g>
          )
        })}
      </svg>
    )
  }

  function Calendar() {
    const logMap = {}
    logs.forEach(l => { logMap[l.logged_at] = l.weight_kg })
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).getDate()
    const firstWd     = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay()
    const todayDate   = new Date()
    const vals        = Object.values(logMap)
    const minW = vals.length ? Math.min(...vals) : goal
    const maxW = vals.length ? Math.max(...vals) : goal

    function dotColor(w) {
      if (Math.abs(w-goal) < 0.5) return 'var(--green)'
      if (w < goal) return 'var(--blue)'
      const pct = (w-goal)/(maxW-goal+0.01)
      if (pct < 0.3) return 'var(--orange)'
      if (pct < 0.6) return 'var(--red)'
      return 'var(--red)'
    }

    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1))}
            style={{ width:36, height:36, borderRadius:10, background:'var(--card2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ fontWeight:700, fontSize:16 }}>{calMonth.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</div>
          <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1))}
            style={{ width:36, height:36, borderRadius:10, background:'var(--card2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:6 }}>
          {['S','M','T','W','T','F','S'].map((d,i) => (
            <div key={i} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--muted)', padding:'4px 0' }}>{d}</div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
          {Array.from({length:firstWd}).map((_,i) => <div key={'e'+i}/>)}
          {Array.from({length:daysInMonth}).map((_,i) => {
            const day = i+1
            const ds  = `${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const wt  = logMap[ds]
            const isToday  = ds === today
            const isSel    = ds === selectedDay
            const isFuture = new Date(ds) > todayDate
            return (
              <button key={day} onClick={() => !isFuture && setSelectedDay(isSel?null:ds)}
                style={{
                  aspectRatio:'1', borderRadius:10, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:1,
                  border: isSel?'2px solid var(--primary)':isToday?'2px solid var(--primary)':'2px solid transparent',
                  background: isSel?'var(--primary)':wt?`color-mix(in srgb, ${dotColor(wt)} 14%, transparent)`:'var(--card2)',
                  cursor: isFuture?'default':'pointer', opacity:isFuture?0.3:1, padding:0
                }}>
                <span style={{ fontSize:11, fontWeight:isToday||isSel?700:400, color:isSel?'var(--colored-label)':'var(--text)', lineHeight:1 }}>{day}</span>
                {wt && <div style={{ width:5, height:5, borderRadius:'50%', background:isSel?'var(--colored-label)':dotColor(wt) }}/>}
              </button>
            )
          })}
        </div>

        <div style={{ display:'flex', gap:10, marginTop:14, flexWrap:'wrap' }}>
          {[{c:'var(--green)',l:'At goal'},{c:'var(--blue)',l:'Below goal'},{c:'var(--orange)',l:'Slightly over'},{c:'var(--red)',l:'Over goal'}].map(x=>(
            <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:x.c }}/>
              <span style={{ fontSize:10, color:'var(--muted)' }}>{x.l}</span>
            </div>
          ))}
        </div>

        {selectedDay && (
          <div style={{ marginTop:16, padding:'14px', background:'var(--card2)', borderRadius:14, border:'1.5px solid var(--border)' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>
              {fmtDate(selectedDay,{weekday:'long',day:'numeric',month:'long'})}
            </div>
            {logMap[selectedDay] ? (
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:28, fontWeight:800, color:dotColor(logMap[selectedDay]) }}>{logMap[selectedDay]} kg</div>
                <div style={{ fontSize:13, color:'var(--muted)' }}>
                  {logMap[selectedDay] > goal ? '+' : ''}{(logMap[selectedDay]-goal).toFixed(1)} kg vs goal
                </div>
              </div>
            ) : (
              <div style={{ fontSize:13, color:'var(--muted)' }}>No weight logged this day</div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', maxWidth:430, margin:'0 auto', paddingBottom:120 }}>
      <style jsx>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
        @keyframes wSheetUp { from { transform:translateY(100%);} to { transform:translateY(0);} }
        .fade-in-up { animation: fadeInUp 0.4s cubic-bezier(.4,0,.2,1) both; }
        .tap-scale { transition: transform 0.15s ease; }
        .tap-scale:active { transform: scale(0.96); }
        .w-sheet-up { animation: wSheetUp 0.3s cubic-bezier(.4,0,.2,1); }
      `}</style>

      {/* Toast — high z-index so it's visible even when the log sheet is open */}
      {msg && (
        <div style={{ position:'fixed', top:'calc(env(safe-area-inset-top,0px) + 16px)', left:'50%', transform:'translateX(-50%)', zIndex:3000, background: msg==='Logged!' ? 'var(--text)' : 'var(--red)', color:msg==='Logged!'?'var(--surface)':'var(--primary-contrast)', padding:'10px 20px', borderRadius:99, fontSize:13, fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
          {msg==='Logged!' ? '✓ ' : '⚠ '}{msg}
        </div>
      )}

      {/* Header */}
      <div className="fade-in-up" style={{ display:'flex', alignItems:'center', gap:12, padding:'calc(env(safe-area-inset-top,0px) + 16px) 20px 16px' }}>
        <button onClick={() => router.back()} className="tap-scale"
          style={{ width:38, height:38, borderRadius:12, background:'var(--card)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.02em', color:'var(--text)' }}>Weight</h1>
          <p style={{ fontSize:12, color:'var(--muted)', marginTop:2, fontWeight:500 }}>{sorted.length} entries · goal {goal} kg</p>
        </div>
      </div>

      {/* Top trio: Current / Goal / Difference */}
      <div className="fade-in-up" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, padding:'0 20px', marginBottom:16 }}>
        {[
          { label:'Current', val: latest ? `${latest.weight_kg}` : '—', color:'var(--primary)' },
          { label:'Goal', val: `${goal}`, color:'var(--green)' },
          { label:'Difference', val: toGoal!==null ? `${toGoal>0?'+':''}${toGoal}` : '—', color: toGoal!==null && toGoal<=0 ? 'var(--green)' : 'var(--orange)' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:'16px 10px', textAlign:'center', boxShadow:'0 2px 10px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize:19, fontWeight:800, color:s.color }}>{s.val}<span style={{ fontSize:11, fontWeight:600, marginLeft:2 }}>kg</span></div>
            <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginTop:5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Interactive graph — Weekly / Monthly / Yearly */}
      <div className="fade-in-up" style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:22, padding:'18px 16px', margin:'0 20px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontWeight:700, fontSize:16, color:'var(--text)' }}>Weight trend</div>
          <div style={{ display:'flex', gap:2, background:'var(--card2)', borderRadius:99, padding:3 }}>
            {[['week','Weekly'],['month','Monthly'],['year','Yearly']].map(([v,l]) => (
              <button key={v} onClick={() => setChartView(v)} className="tap-scale"
                style={{ padding:'6px 11px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', border:'none', background:chartView===v?'var(--primary)':'transparent', color:chartView===v?'var(--colored-label)':'var(--muted)', transition:'background 0.2s' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <LineChart data={chartData}/>
        {chartData.length>=2 && (
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            {[
              { l:'Start', v:chartData[0].weight_kg+' kg', c:'var(--muted)' },
              { l:'Change', v:(parseFloat((chartData[chartData.length-1].weight_kg-chartData[0].weight_kg).toFixed(1))>0?'+':'')+parseFloat((chartData[chartData.length-1].weight_kg-chartData[0].weight_kg).toFixed(1))+' kg', c:chartData[chartData.length-1].weight_kg<chartData[0].weight_kg?'var(--green)':'var(--red)' },
              { l:'Now', v:chartData[chartData.length-1].weight_kg+' kg', c:'var(--primary)' },
            ].map(s=>(
              <div key={s.l} style={{ flex:1, textAlign:'center', background:'var(--surface)', borderRadius:12, padding:'10px 8px', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:14, fontWeight:800, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BMI card */}
      {bmiVal && (
        <div className="fade-in-up" style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'16px', margin:'0 20px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.03)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>BMI</div>
            <div style={{ fontSize:14, fontWeight:800, color:bmiColor }}>{bmiVal} — {bmiCat}</div>
          </div>
          <div style={{ height:8, background:'var(--card2)', borderRadius:4, overflow:'hidden', position:'relative' }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', width:'100%', display:'flex' }}>
              {[{c:'var(--blue)',w:25},{c:'var(--green)',w:25},{c:'var(--orange)',w:20},{c:'var(--red)',w:16},{c:'var(--red)',w:14}].map((s,i)=>(
                <div key={i} style={{ height:'100%', width:s.w+'%', background:s.c, opacity:0.45 }}/>
              ))}
            </div>
            <div style={{ position:'absolute', top:-2, height:12, width:4, borderRadius:2, background:bmiColor, left:`${Math.min(96,Math.max(2,((bmiVal-10)/30)*100))}%`, transform:'translateX(-50%)', transition:'left 0.6s' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
            {['Under','Normal','Over','Obese I','Obese II'].map((l,i)=>(
              <div key={i} style={{ fontSize:9, color:'var(--muted)', textAlign:'center', flex:1 }}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {/* Body Fat card — not tracked yet, clearly labeled rather than faked */}
      <div className="fade-in-up" style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'16px', margin:'0 20px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}><IconDroplet size={18}/></div>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', flex:1 }}>Body Fat</div>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', background:'var(--card2)', padding:'3px 9px', borderRadius:99, textTransform:'uppercase', letterSpacing:'0.04em' }}>Not tracked</div>
        </div>
        <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.6 }}>Body fat % isn't logged anywhere in your data yet — needs a body-fat entry (manual or scale) to show real numbers here.</div>
      </div>

      {/* Lean Mass card — depends on Body Fat, so also not available */}
      <div className="fade-in-up" style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'16px', margin:'0 20px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}><IconMuscle size={18}/></div>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', flex:1 }}>Lean Mass</div>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', background:'var(--card2)', padding:'3px 9px', borderRadius:99, textTransform:'uppercase', letterSpacing:'0.04em' }}>Not tracked</div>
        </div>
        <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.6 }}>Calculated from weight × (1 − body fat%) — blocked on Body Fat above being tracked first.</div>
      </div>

      {/* Progress Photos card — feature doesn't exist yet */}
      <div className="fade-in-up" style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'16px', margin:'0 20px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}><IconCamera size={18}/></div>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', flex:1 }}>Progress Photos</div>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', background:'var(--card2)', padding:'3px 9px', borderRadius:99, textTransform:'uppercase', letterSpacing:'0.04em' }}>Coming soon</div>
        </div>
        <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.6 }}>Photo upload and storage aren't wired up in the app yet — no table or upload flow exists for this today.</div>
      </div>

      {/* Measurements — real link to your existing /measurements page */}
      <button onClick={() => router.push('/measurements')} className="fade-in-up tap-scale"
        style={{ width:'100%', display:'flex', alignItems:'center', gap:14, background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'16px', margin:'0 20px 20px', cursor:'pointer', textAlign:'left', boxShadow:'0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ width:44, height:44, borderRadius:13, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><IconRuler size={20}/></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Measurements</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Chest, waist, arms & more</div>
        </div>
        <IconChevronRight/>
      </button>

      {/* ── Everything below preserves your existing Overview/Charts/Calendar content, now inline ── */}
      <div style={{ padding:'0 20px' }}>

        {/* This week */}
        {last7.length>0 && (
          <div className="fade-in-up" style={{ background:'var(--card)', borderRadius:20, padding:'16px', border:'1px solid var(--border)', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:14, color:'var(--text)' }}>This week</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { l:'Entries', v:last7.length, c:'var(--primary)' },
                { l:'Average', v:weekAvg?weekAvg+' kg':'—', c:'var(--green)' },
                { l:'Change', v:weekChg!==null?(weekChg>0?'+':'')+weekChg+' kg':'—', c:weekChg&&weekChg<0?'var(--green)':'var(--red)' },
              ].map(s=>(
                <div key={s.l} style={{ textAlign:'center', background:'var(--surface)', borderRadius:12, padding:'12px 6px', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:15, fontWeight:800, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            {(() => {
              const days = Array.from({length:7}, (_,i) => {
                const d = addDays(new Date(), i-6)
                const ds = toISO(d)
                const log = logs.find(l => l.logged_at===ds)
                return { ds, day:d.toLocaleDateString('en-IN',{weekday:'short'}).slice(0,1), log }
              })
              const vals = days.filter(d=>d.log).map(d=>d.log.weight_kg)
              const minV = vals.length?Math.min(...vals):0, maxV=vals.length?Math.max(...vals):0
              return (
                <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:64 }}>
                  {days.map((d,i) => {
                    const h = d.log&&maxV>minV ? Math.max(8,((d.log.weight_kg-minV)/(maxV-minV+0.01))*48+12) : d.log?28:4
                    const isT = d.ds===today
                    return (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                        {d.log && <div style={{ fontSize:8, color:'var(--primary)', fontWeight:700 }}>{d.log.weight_kg}</div>}
                        <div style={{ width:'100%', height:h, borderRadius:5, background:d.log?'var(--primary)':'var(--border)', opacity:isT?1:0.55, transition:'height 0.4s' }}/>
                        <div style={{ fontSize:9, color:isT?'var(--primary)':'var(--muted)', fontWeight:isT?700:400 }}>{d.day}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* Progress to goal */}
        {latest && (
          <div className="fade-in-up" style={{ background:'var(--card)', borderRadius:20, padding:'16px', border:'1px solid var(--border)', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Progress to goal</div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>{goal} kg</div>
            </div>
            {(() => {
              const start   = first?.weight_kg ?? latest.weight_kg
              const curr    = latest.weight_kg
              const dir     = start > goal ? 'lose' : 'gain'
              const total   = Math.abs(start - goal)
              const done    = dir==='lose' ? Math.max(0,start-curr) : Math.max(0,curr-start)
              const pct     = total>0 ? Math.min(100,Math.round((done/total)*100)) : 100
              const weeksLeft = total>0 ? Math.round(Math.abs(curr-goal)/0.5) : 0
              return (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>Start: {start} kg</span>
                    <span style={{ fontSize:15, fontWeight:800, color:'var(--primary)' }}>{pct}%</span>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>Goal: {goal} kg</span>
                  </div>
                  <div style={{ height:14, background:'var(--card2)', borderRadius:7, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:7, background:'linear-gradient(90deg,var(--primary),var(--green))', width:pct+'%', transition:'width 1s ease' }}/>
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:10, textAlign:'center', lineHeight:1.6 }}>
                    {Math.abs(curr-goal).toFixed(1)} kg to go · at 0.5 kg/week ≈ <strong style={{ color:'var(--text)' }}>{weeksLeft} weeks</strong>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Weekly averages */}
        <div className="fade-in-up" style={{ background:'var(--card)', borderRadius:20, padding:'16px', border:'1px solid var(--border)', marginBottom:14 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:'var(--text)' }}>Weekly averages</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>Green = losing · Red = gaining · Purple = stable</div>
          <BarChart/>
        </div>

        {/* Rate of change */}
        {sorted.length>=7 && (
          <div className="fade-in-up" style={{ background:'var(--card)', borderRadius:20, padding:'16px', border:'1px solid var(--border)', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:14, color:'var(--text)' }}>Rate of change</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {(() => {
                const rw = sorted.slice(-7)
                const rateW = rw.length>=2 ? parseFloat(((rw[rw.length-1].weight_kg-rw[0].weight_kg)/(rw.length/7)).toFixed(2)) : null
                const rm = sorted.slice(Math.max(0,sorted.length-30))
                const rateM = rm.length>=2 ? parseFloat(((rm[rm.length-1].weight_kg-rm[0].weight_kg)/4).toFixed(2)) : null
                return [
                  { l:'Per week (recent)', v:rateW!==null?(rateW>0?'+':'')+rateW+' kg':'—', c:rateW!==null&&rateW<0?'var(--green)':'var(--red)' },
                  { l:'Per month (est)', v:rateM!==null?(rateM>0?'+':'')+rateM+' kg':'—', c:rateM!==null&&rateM<0?'var(--green)':'var(--red)' },
                ].map(s=>(
                  <div key={s.l} style={{ background:'var(--surface)', borderRadius:14, padding:'16px', border:'1px solid var(--border)', textAlign:'center' }}>
                    <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>{s.l}</div>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}

        {/* Calendar */}
        <div className="fade-in-up" style={{ background:'var(--card)', borderRadius:20, padding:'16px', border:'1px solid var(--border)', marginBottom:14 }}>
          <Calendar/>
        </div>
        {(() => {
          const ms = `${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,'0')}-01`
          const me = `${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,'0')}-31`
          const ml = sorted.filter(l => l.logged_at>=ms && l.logged_at<=me)
          if (!ml.length) return null
          const mAvg = (ml.reduce((s,l)=>s+l.weight_kg,0)/ml.length).toFixed(1)
          const mMin = Math.min(...ml.map(l=>l.weight_kg))
          const mMax = Math.max(...ml.map(l=>l.weight_kg))
          return (
            <div className="fade-in-up" style={{ background:'var(--card)', borderRadius:20, padding:'16px', border:'1px solid var(--border)', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:14, color:'var(--text)' }}>
                {calMonth.toLocaleDateString('en-IN',{month:'long'})} summary
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                {[
                  { l:'Entries', v:String(ml.length), c:'var(--primary)' },
                  { l:'Average', v:mAvg+' kg', c:'var(--primary)' },
                  { l:'Lowest', v:mMin+' kg', c:'var(--green)' },
                  { l:'Highest', v:mMax+' kg', c:'var(--red)' },
                ].map(s=>(
                  <div key={s.l} style={{ textAlign:'center', background:'var(--surface)', borderRadius:12, padding:'12px 6px', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:14, fontWeight:800, color:s.c }}>{s.v}</div>
                    <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600, marginTop:3, textTransform:'uppercase' }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* All entries */}
        <div className="fade-in-up" style={{ background:'var(--card)', borderRadius:20, padding:'16px', border:'1px solid var(--border)' }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:14, color:'var(--text)' }}>All entries</div>
          {sorted.length===0 ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:'var(--muted)', fontSize:13 }}>No entries yet. Tap the + button to log your first weight.</div>
          ) : (
            <div style={{ maxHeight:320, overflowY:'auto' }}>
              {[...sorted].reverse().map((log,i,arr) => {
                const prev = arr[i+1]
                const diff = prev ? parseFloat((log.weight_kg-prev.weight_kg).toFixed(1)) : null
                return (
                  <div key={log.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 0', borderBottom:i<arr.length-1?'1px solid var(--border)':'none' }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>{fmtDate(log.logged_at,{weekday:'short',day:'numeric',month:'short'})}</div>
                      {diff!==null && <div style={{ fontSize:11, color:diff<0?'var(--green)':diff>0?'var(--red)':'var(--muted)', marginTop:2 }}>{diff>0?'+':''}{diff} kg</div>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ fontSize:18, fontWeight:800, color:diff!==null&&diff<0?'var(--green)':diff!==null&&diff>0?'var(--red)':'var(--text)' }}>{log.weight_kg} kg</div>
                      <button onClick={() => deleteLog(log.id)} className="tap-scale" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', alignItems:'center', justifyContent:'center', padding:4 }}>
                        <IconX size={16}/>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Add Weight button — iOS glass circle vs Android Material square */}
      <button onClick={() => setShowLogSheet(true)} className="tap-scale"
        style={isAndroid ? {
          position:'fixed', right:20, bottom:'calc(env(safe-area-inset-bottom,0px) + 96px)', zIndex:1500,
          width:56, height:56, borderRadius:16, background:'var(--primary)', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 6px 16px -4px rgba(0,0,0,0.35)'
        } : {
          position:'fixed', right:20, bottom:'calc(env(safe-area-inset-bottom,0px) + 96px)', zIndex:1500,
          width:58, height:58, borderRadius:'50%', cursor:'pointer',
          background:'color-mix(in srgb, var(--primary) 88%, transparent)',
          backdropFilter:'blur(16px) saturate(180%)', WebkitBackdropFilter:'blur(16px) saturate(180%)',
          border:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 8px 24px -6px rgba(0,0,0,0.3)'
        }}>
        <IconPlus size={24}/>
      </button>

      {/* Log weight sheet — same input + logWeight() call as before, just triggered from the FAB now */}
      {showLogSheet && (
        <div onClick={() => setShowLogSheet(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'flex-end' }}>
          <div onClick={e => e.stopPropagation()} className="w-sheet-up" style={{ background:'var(--surface)', width:'100%', maxWidth:430, margin:'0 auto', borderRadius:'26px 26px 0 0', padding:'20px 20px calc(env(safe-area-inset-bottom,0px) + 20px)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:18, color:'var(--text)' }}>Log today's weight</div>
              <button onClick={() => setShowLogSheet(false)} className="tap-scale" style={{ background:'var(--card2)', border:'none', borderRadius:10, width:32, height:32, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
                <IconX size={14}/>
              </button>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ flex:1, position:'relative' }}>
                <input type="text" inputMode="decimal" placeholder="e.g. 75.5" value={input} autoFocus
                  onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter' && logWeight()}
                  style={{ width:'100%', fontSize:26, fontWeight:800, color:'var(--primary)', textAlign:'center', background:'var(--primary-bg)', border:'1.5px solid var(--primary)', borderRadius:14, padding:'14px 44px 14px 14px', outline:'none' }}/>
                <div style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'var(--primary)', fontWeight:700 }}>kg</div>
              </div>
              <button onClick={logWeight} disabled={saving} className="tap-scale"
                style={{ width:56, height:56, borderRadius:14, background:'var(--primary)', border:'none', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', opacity:saving?0.7:1 }}>
                <IconCheck/>
              </button>
            </div>
            {latest && <div style={{ marginTop:12, fontSize:12, color:'var(--muted)', textAlign:'center' }}>Last: <strong style={{ color:'var(--text)' }}>{latest.weight_kg} kg</strong> · {fmtDate(latest.logged_at,{weekday:'short',day:'numeric',month:'short'})}</div>}
          </div>
        </div>
      )}

      <BottomNav/>
    </div>
  )
}
