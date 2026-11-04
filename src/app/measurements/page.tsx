'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { IconByName } from '@/lib/icons'

const MEASUREMENTS = [
  { key: 'waist', label: 'Waist', icon: 'RulerIcon', color: 'var(--primary)' },
  { key: 'chest', label: 'Chest', icon: 'MuscleIcon', color: 'var(--blue)' },
  { key: 'hips', label: 'Hips', icon: 'CircleIcon', color: 'var(--taupe)' },
  { key: 'arms', label: 'Arms', icon: 'MuscleIcon', color: 'var(--orange)' },
  { key: 'thighs', label: 'Thighs', icon: 'LegIcon', color: 'var(--green)' },
  { key: 'shoulders', label: 'Shoulders', icon: 'MuscleIcon', color: 'var(--red)' },
]

export default function MeasurementsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState([])
  const [form, setForm] = useState({ waist:'', chest:'', hips:'', arms:'', thighs:'', shoulders:'' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [activeChart, setActiveChart] = useState('waist')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    const { data } = await supabase.from('measurements').select('*').eq('user_id', user.id).order('logged_at', { ascending: true }).limit(30)
    if (data) setLogs(data)
  }

  async function save() {
    const hasValue = Object.values(form).some(v => v !== '')
    if (!hasValue) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const today = new Date().toISOString().slice(0, 10)
    const entry = { user_id: user.id, logged_at: today }
    MEASUREMENTS.forEach(m => { if (form[m.key]) entry[m.key] = parseFloat(form[m.key]) })
    await supabase.from('measurements').upsert(entry, { onConflict: 'user_id,logged_at' })
    setMsg('Saved!'); setTimeout(() => setMsg(''), 2000)
    setForm({ waist:'', chest:'', hips:'', arms:'', thighs:'', shoulders:'' })
    setSaving(false); load()
  }

  function MiniChart({ mKey, color }) {
    const data = logs.filter(l => l[mKey]).map(l => ({ v: l[mKey], d: l.logged_at?.slice(5) }))
    if (data.length < 2) return <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:12 }}>Log at least 2 entries to see chart</div>
    const vals = data.map(d => d.v), min = Math.min(...vals) - 1, max = Math.max(...vals) + 1
    const W = 300, H = 70
    const pts = data.map((d, i) => ({ x: (i / (data.length-1)) * W, y: H - ((d.v - min) / (max - min)) * H, d }))
    const path = pts.map((p, i) => (i===0?'M':'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')
    return (
      <svg width="100%" viewBox={'0 0 ' + W + ' ' + (H+20)} style={{ overflow:'visible' }}>
        <defs><linearGradient id={'g'+mKey} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
        <path d={path + ' L'+W+','+(H+20)+' L0,'+(H+20)+' Z'} fill={'url(#g'+mKey+')'}/>
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={i===0||i===pts.length-1?5:3} fill={color} stroke="var(--primary-contrast)" strokeWidth="2"/>
            {(i===0||i===pts.length-1||data.length<=5) && <text x={p.x} y={p.y-9} textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>{p.d.v}</text>}
          </g>
        ))}
        <text x="0" y={H+18} fontSize="9" fill="var(--muted)">{data[0].d}</text>
        <text x={W} y={H+18} textAnchor="end" fontSize="9" fill="var(--muted)">{data[data.length-1].d}</text>
      </svg>
    )
  }

  const latest = logs[logs.length-1]
  const first = logs[0]

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', maxWidth:430, margin:'0 auto', paddingBottom:100 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding: 'calc(env(safe-area-inset-top,0px) + 12px) 20px 16px' }}>
        <button onClick={() => router.back()} style={{ width:38, height:38, borderRadius:12, background:'var(--card)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Body Measurements</h1>
          <p style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Track your body changes over time</p>
        </div>
      </div>

      <div style={{ padding:'0 20px' }}>
        {msg && <div style={{ background:'var(--green-bg)', border:'1.5px solid var(--green)', borderRadius:12, padding:'10px 16px', marginBottom:16, fontSize:13, fontWeight:600, color:'var(--green)' }}>✓ {msg}</div>}

        {/* Latest vs First comparison */}
        {logs.length >= 2 && (
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>📉 Progress since start</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {MEASUREMENTS.filter(m => first?.[m.key] && latest?.[m.key]).map(m => {
                const diff = (latest[m.key] - first[m.key]).toFixed(1)
                const isGood = parseFloat(diff) < 0
                return (
                  <div key={m.key} style={{ background:'var(--surface)', borderRadius:12, padding:'10px', border:'1.5px solid var(--border)', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>{m.label}</div>
                    <div style={{ fontSize:16, fontWeight:800, color:m.color }}>{latest[m.key]}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:isGood?'var(--green)':'var(--red)' }}>
                      {parseFloat(diff)>0?'+':''}{diff} cm
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Chart */}
        {logs.length >= 2 && (
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>Trend chart</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {MEASUREMENTS.filter(m => logs.some(l => l[m.key])).map(m => (
                <button key={m.key} onClick={() => setActiveChart(m.key)}
                  style={{ padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer', border:'1.5px solid '+(activeChart===m.key?m.color:'var(--border)'), background:activeChart===m.key?m.color:'transparent', color:activeChart===m.key?'var(--colored-label)':'var(--muted)' }}>
                  {m.label}
                </button>
              ))}
            </div>
            {(() => { const m = MEASUREMENTS.find(x => x.key === activeChart); return m ? <MiniChart mKey={m.key} color={m.color}/> : null })()}
          </div>
        )}

        {/* Log form */}
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Log today's measurements</div>
          <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>All measurements in centimeters (cm)</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {MEASUREMENTS.map(m => (
              <div key={m.key}>
                <div style={{ fontSize:11, fontWeight:700, color:m.color, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                  <IconByName name={m.icon} size={14} color={m.color} />
                  <span>{m.label}</span>
                </div>
                <input type="text" inputMode="decimal" placeholder="cm" value={form[m.key]}
                  onChange={e => setForm(p => ({ ...p, [m.key]: e.target.value }))}/>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width:'100%', padding:'14px', fontWeight:700, marginTop:16 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save measurements'}
          </button>
        </div>

        {/* Log history */}
        {logs.length > 0 && (
          <div className="card">
            <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>History</div>
            <div style={{ maxHeight:240, overflowY:'auto' }}>
              {[...logs].reverse().map((log, i) => (
                <div key={i} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:6 }}>
                    {new Date(log.logged_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {MEASUREMENTS.filter(m => log[m.key]).map(m => (
                      <span key={m.key} style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:99, background:'var(--card2)', color:m.color }}>
                        {m.label}: {log[m.key]}cm
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  )
}
