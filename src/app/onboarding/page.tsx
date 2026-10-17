// @ts-nocheck
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ChartDownIcon, ScaleIcon, MuscleIcon, CouchIcon, WalkIcon, PlayIcon, BoltIcon } from '@/lib/icons'
import { invalidateDashboardSnapshot } from '@/lib/dashboard-cache'

const STEPS = ['goal', 'body', 'activity', 'done']

const GOALS = [
  { key:'lose', icon:<ChartDownIcon size={28} color='#10b981'/>, label:'Lose weight', desc:'Burn fat, get leaner', color:'#10b981', bg:'#d1fae5' },
  { key:'maintain', icon:<ScaleIcon size={28} color='#f59e0b'/>, label:'Stay healthy', desc:'Maintain current weight', color:'#f59e0b', bg:'#fef3c7' },
  { key:'gain', icon:<MuscleIcon size={28} color='#3b82f6'/>, label:'Build muscle', desc:'Gain strength and size', color:'#3b82f6', bg:'#dbeafe' },
]

const ACTIVITY_LEVELS = [
  { key:'sedentary', icon:<CouchIcon size={28} color='#6366f1'/>, label:'Sedentary', desc:'Desk job, little exercise', mul:1.2 },
  { key:'light', icon:<WalkIcon size={28} color='#10b981'/>, label:'Lightly active', desc:'1–3 workouts/week', mul:1.375 },
  { key:'moderate', icon:<PlayIcon size={28} color='#6366f1'/>, label:'Moderately active', desc:'3–5 workouts/week', mul:1.55 },
  { key:'very', icon:<MuscleIcon size={28} color='#3b82f6'/>, label:'Very active', desc:'6–7 workouts/week', mul:1.725 },
  { key:'extra', icon:<BoltIcon size={28} color='#f59e0b'/>, label:'Athlete', desc:'Physical job + daily training', mul:1.9 },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    goal: '', name: '', gender: 'male', age: '', height: '', weight: '', activity: 'moderate'
  })

  function next() { setStep(s => Math.min(s+1, STEPS.length-1)) }
  function back() { setStep(s => Math.max(s-1, 0)) }

  function calcTargets() {
    const h = parseFloat(data.height), w = parseFloat(data.weight), a = parseInt(data.age)
    if (!h || !w || !a) return { cal:1700, protein:130, carb:170, fat:57 }
    const act = ACTIVITY_LEVELS.find(l => l.key === data.activity)
    const bmr = data.gender === 'male' ? 10*w + 6.25*h - 5*a + 5 : 10*w + 6.25*h - 5*a - 161
    let tdee = Math.round(bmr * act.mul)
    if (data.goal === 'lose') tdee -= 500
    else if (data.goal === 'gain') tdee += 300
    return {
      cal: tdee,
      protein: Math.round(w * (data.goal === 'lose' ? 2.2 : data.goal === 'gain' ? 2.4 : 1.8)),
      carb: Math.round((tdee * 0.45) / 4),
      fat: Math.round((tdee * 0.25) / 9),
    }
  }

  async function finish() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    const targets = calcTargets()
    await supabase.from('profiles').update({
      name: data.name, gender: data.gender, age: parseInt(data.age) || null,
      height: parseFloat(data.height) || null, goal: data.goal,
      cal_target: targets.cal, protein_target: targets.protein,
      carb_target: targets.carb, fat_target: targets.fat,
      water_goal: 2500, fiber_target: 28,
    }).eq('id', user.id)
    invalidateDashboardSnapshot(user.id)
    setSaving(false)
    router.replace('/dashboard')
  }

  const inp = { fontSize:15, padding:'14px 16px', borderRadius:14, border:'1.5px solid var(--border)', background:'var(--card)', color:'var(--text)', width:'100%', outline:'none' }

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', maxWidth:430, margin:'0 auto', display:'flex', flexDirection:'column' }}>
      {/* Progress bar */}
      <div style={{ height:4, background:'var(--border)' }}>
        <div style={{ height:'100%', background:'var(--primary)', width:((step+1)/STEPS.length*100)+'%', transition:'width 0.4s ease', borderRadius:2 }}/>
      </div>

      <div style={{ flex:1, padding:'32px 24px 40px', display:'flex', flexDirection:'column' }}>
        {/* Step 0 — Goal */}
        {step === 0 && (
          <div style={{ flex:1 }}>
            <div style={{ marginBottom:32 }}>
              <p style={{ fontSize:13, color:'var(--muted)', fontWeight:500, marginBottom:8 }}>Step 1 of 3</p>
              <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:'-0.02em', marginBottom:8 }}>What's your main goal?</h1>
              <p style={{ fontSize:14, color:'var(--muted)', lineHeight:1.6 }}>We'll set your calorie and macro targets based on this.</p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {GOALS.map(g => (
                <button key={g.key} onClick={() => { setData(p => ({...p, goal:g.key})); setTimeout(next, 200) }}
                  style={{ padding:'20px', borderRadius:20, border:'2px solid '+(data.goal===g.key?g.color:'var(--border)'), background:data.goal===g.key?g.bg:'var(--card)', cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ fontSize:32, width:52, height:52, borderRadius:16, background:data.goal===g.key?'rgba(255,255,255,0.6)':'var(--card2)', display:'flex', alignItems:'center', justifyContent:'center' }}>{g.icon}</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:16, color:data.goal===g.key?g.color:'var(--text)' }}>{g.label}</div>
                      <div style={{ fontSize:13, color:'var(--muted)', marginTop:3 }}>{g.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — Body */}
        {step === 1 && (
          <div style={{ flex:1 }}>
            <div style={{ marginBottom:28 }}>
              <p style={{ fontSize:13, color:'var(--muted)', fontWeight:500, marginBottom:8 }}>Step 2 of 3</p>
              <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:'-0.02em', marginBottom:8 }}>Tell us about yourself</h1>
              <p style={{ fontSize:14, color:'var(--muted)' }}>Used to calculate your exact calorie needs.</p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Your name</div>
                <input type="text" placeholder="First name" value={data.name} onChange={e => setData(p=>({...p,name:e.target.value}))} style={inp}/>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Gender</div>
                <div style={{ display:'flex', gap:10 }}>
                  {['male','female','other'].map(g => (
                    <button key={g} onClick={() => setData(p=>({...p,gender:g}))}
                      style={{ flex:1, padding:'12px', borderRadius:14, border:'2px solid '+(data.gender===g?'var(--primary)':'var(--border)'), background:data.gender===g?'var(--primary-bg)':'var(--card)', color:data.gender===g?'var(--primary)':'var(--muted)', fontWeight:700, fontSize:13, cursor:'pointer', textTransform:'capitalize' }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                {[{l:'Age',k:'age',u:'yrs',m:'numeric'},{l:'Height',k:'height',u:'cm',m:'decimal'},{l:'Weight',k:'weight',u:'kg',m:'decimal'}].map(f => (
                  <div key={f.k} style={{ background:'var(--card)', borderRadius:14, padding:'14px 10px', border:'1.5px solid var(--border)', textAlign:'center' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:8 }}>{f.l}</div>
                    <input type="text" inputMode={f.m} placeholder="0" value={data[f.k]} onChange={e => setData(p=>({...p,[f.k]:e.target.value}))}
                      style={{ textAlign:'center', fontWeight:800, fontSize:22, background:'transparent', border:'none', padding:0, width:'100%', outline:'none', color:'var(--text)' }}/>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{f.u}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Activity */}
        {step === 2 && (
          <div style={{ flex:1 }}>
            <div style={{ marginBottom:24 }}>
              <p style={{ fontSize:13, color:'var(--muted)', fontWeight:500, marginBottom:8 }}>Step 3 of 3</p>
              <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:'-0.02em', marginBottom:8 }}>How active are you?</h1>
              <p style={{ fontSize:14, color:'var(--muted)' }}>This sets your calorie burn multiplier.</p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {ACTIVITY_LEVELS.map(l => (
                <button key={l.key} onClick={() => setData(p=>({...p,activity:l.key}))}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:16, border:'2px solid '+(data.activity===l.key?'var(--primary)':'var(--border)'), background:data.activity===l.key?'var(--primary-bg)':'var(--card)', cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}>
                  <span style={{ fontSize:24, flexShrink:0 }}>{l.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:data.activity===l.key?'var(--primary)':'var(--text)' }}>{l.label}</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{l.desc}</div>
                  </div>
                  {data.activity===l.key && <div style={{ width:20, height:20, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center' }}>
            <div style={{ fontSize:72, marginBottom:20 }}>🎉</div>
            <h1 style={{ fontSize:26, fontWeight:700, marginBottom:12 }}>You're all set, {data.name || 'friend'}!</h1>
            {(() => {
              const t = calcTargets()
              return (
                <div style={{ width:'100%', marginBottom:28 }}>
                  <p style={{ fontSize:14, color:'var(--muted)', marginBottom:20, lineHeight:1.7 }}>
                    Here are your personalized daily targets based on your goal to <strong>{data.goal === 'lose' ? 'lose weight' : data.goal === 'gain' ? 'build muscle' : 'stay healthy'}</strong>.
                  </p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {[{l:'Calories',v:t.cal,u:'kcal',c:'#6366f1'},{l:'Protein',v:t.protein,u:'g',c:'#3b82f6'},{l:'Carbs',v:t.carb,u:'g',c:'#f59e0b'},{l:'Fat',v:t.fat,u:'g',c:'#ef4444'}].map(m=>(
                      <div key={m.l} style={{ background:'var(--card)', borderRadius:16, padding:'16px', border:'1.5px solid var(--border)', textAlign:'center' }}>
                        <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', marginBottom:6 }}>{m.l}</div>
                        <div style={{ fontSize:24, fontWeight:800, color:m.c }}>{m.v}<span style={{ fontSize:13, fontWeight:400, color:'var(--muted)' }}> {m.u}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            <button className="btn btn-primary" style={{ width:'100%', padding:'16px', fontSize:16, fontWeight:700 }} onClick={finish} disabled={saving}>
              {saving ? 'Setting up…' : 'Start tracking →'}
            </button>
          </div>
        )}

        {/* Navigation */}
        {step < 3 && (
          <div style={{ display:'flex', gap:10, marginTop:24 }}>
            {step > 0 && (
              <button onClick={back} className="btn btn-ghost" style={{ flex:1, padding:'14px', fontWeight:600 }}>← Back</button>
            )}
            <button onClick={next} className="btn btn-primary" style={{ flex:2, padding:'14px', fontWeight:700 }} disabled={
              (step===0 && !data.goal) ||
              (step===1 && (!data.age || !data.height || !data.weight))
            }>
              {step === 2 ? 'See my targets →' : 'Continue →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
