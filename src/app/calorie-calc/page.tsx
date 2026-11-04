// @ts-nocheck
'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CouchIcon, WalkIcon, PlayIcon, MuscleIcon, BoltIcon, ScaleIcon, SproutIcon, FireIcon, IconByName } from '@/lib/icons'

const ACTIVITY = [
  { id: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise', Icon: CouchIcon, mul: 1.2 },
  { id: 'light', label: 'Lightly active', desc: '1-3 days/week', Icon: WalkIcon, mul: 1.375 },
  { id: 'moderate', label: 'Moderately active', desc: '3-5 days/week', Icon: PlayIcon, mul: 1.55 },
  { id: 'very', label: 'Very active', desc: '6-7 days/week', Icon: MuscleIcon, mul: 1.725 },
  { id: 'extra', label: 'Extra active', desc: 'Athlete / physical job', Icon: BoltIcon, mul: 1.9 },
]

export default function CalorieCalcPage() {
  const router = useRouter()
  const [gender, setGender] = useState('male')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState('moderate')
  const [result, setResult] = useState(null)

  function calculate() {
    const h = parseFloat(height), w = parseFloat(weight), a = parseInt(age)
    if (!h || !w || !a) return
    const act = ACTIVITY.find(l => l.id === activity)
    const bmr = gender === 'male' ? 10*w + 6.25*h - 5*a + 5 : 10*w + 6.25*h - 5*a - 161
    const tdee = Math.round(bmr * act.mul)
    setResult({
      bmr: Math.round(bmr), tdee, actLabel: act.label,
      safe: Math.max(1200, tdee-200),
      moderate: Math.max(1200, tdee-500),
      aggressive: Math.max(1200, tdee-1000),
      gainLean: tdee+250,
      prot: Math.round(w*2),
      carb: Math.round((tdee*0.45)/4),
      fat: Math.round((tdee*0.25)/9),
    })
  }

  const inputStyle = {
    textAlign: 'center' as const,
    fontWeight: 800,
    fontSize: 22,
    background: 'transparent',
    border: 'none',
    padding: 0,
    width: '100%',
    outline: 'none',
    color: 'var(--text)',
    WebkitAppearance: 'none',
  }

  const boxStyle = {
    background: 'var(--card)',
    borderRadius: 16,
    padding: '14px 12px',
    border: '1.5px solid var(--border)',
    textAlign: 'center' as const,
  }

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 20px 16px' }}>
        <button onClick={() => router.back()} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--card)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Calorie Calculator</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Find your daily calorie needs</p>
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>I am</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[{ id: 'male', label: 'Male', symbol: '♂', c: 'var(--primary)', bg: 'var(--primary-bg)' }, { id: 'female', label: 'Female', symbol: '♀', c: 'var(--taupe)', bg: 'var(--primary-bg)' }].map(g => (
              <button key={g.id} onClick={() => setGender(g.id)}
                style={{ flex: 1, padding: '24px 20px', borderRadius: 20, border: '2px solid '+(gender===g.id?g.c:'var(--border)'), background: gender===g.id?g.bg:'var(--card)', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 40, color: gender===g.id?g.c:'var(--muted)', marginBottom: 8 }}>{g.symbol}</div>
                <div style={{ fontWeight: 700, color: gender===g.id?g.c:'var(--muted)' }}>{g.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={boxStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Age</div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={age}
              onChange={e => setAge(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>yrs</div>
          </div>
          <div style={boxStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Height</div>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*"
              value={height}
              onChange={e => setHeight(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>cm</div>
          </div>
          <div style={boxStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Weight</div>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>kg</div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Activity level</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ACTIVITY.map(l => (
              <button key={l.id} onClick={() => setActivity(l.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, border: '2px solid '+(activity===l.id?'var(--primary)':'var(--border)'), background: activity===l.id?'var(--primary-bg)':'var(--card)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 22, flexShrink: 0, display: 'inline-flex' }}>
                  <l.Icon size={22} color={activity===l.id ? 'var(--primary)' : 'var(--muted)'} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: activity===l.id?'var(--primary)':'var(--text)' }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.desc}</div>
                </div>
                {activity===l.id && <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--primary-contrast)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>}
              </button>
            ))}
          </div>
        </div>

        <button onClick={calculate} className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: 15, fontWeight: 700, marginBottom: 24 }}>Calculate my calories</button>

        {result && (
          <div className="slide-up">
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Your metabolism</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', border: '1.5px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>BMR</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{result.bmr}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>kcal at rest</div>
                </div>
                <div style={{ background: 'var(--primary-bg)', borderRadius: 14, padding: '16px', border: '1.5px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Maintenance</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{result.tdee}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{result.actLabel}</div>
                </div>
              </div>
            </div>

            {[
              { icon: 'ScaleIcon', label: 'Maintain weight', desc: 'Stay at current weight', cal: result.tdee, rate: 'No change', color: 'var(--primary)', bg: 'var(--primary-bg)', border: 'var(--border)' },
              { icon: 'SproutIcon', label: 'Lose 0.25 kg/week', desc: 'Safe and sustainable', cal: result.safe, rate: '-200 kcal', color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green)' },
              { icon: 'FireIcon', label: 'Lose 0.5 kg/week', desc: 'Steady fat loss (recommended)', cal: result.moderate, rate: '-500 kcal', color: 'var(--orange)', bg: 'var(--orange-bg)', border: 'var(--border)' },
              { icon: 'BoltIcon', label: 'Lose 1 kg/week', desc: 'Aggressive - short periods only', cal: result.aggressive, rate: '-1000 kcal', color: 'var(--red)', bg: 'var(--red-bg)', border: 'color-mix(in srgb, var(--red) 40%, var(--border))' },
              { icon: 'MuscleIcon', label: 'Gain 0.25 kg/week', desc: 'Lean muscle gain', cal: result.gainLean, rate: '+250 kcal', color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue)' },
            ].map(g => (
              <div key={g.label} style={{ background: g.bg, borderRadius: 20, padding: '18px', border: '1.5px solid '+g.border, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.75)' }}>
                    <IconByName name={g.icon} size={20} color={g.color} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: g.color }}>{g.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{g.desc}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: g.color, background: 'rgba(255,255,255,0.6)', padding: '3px 10px', borderRadius: 99 }}>{g.rate}</div>
                </div>
                <div style={{ fontSize: 36, fontWeight: 900, color: g.color, marginBottom: 12 }}>{g.cal} <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>kcal/day</span></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ l: 'Protein', v: result.prot, c: 'var(--blue)' }, { l: 'Carbs', v: result.carb, c: 'var(--orange)' }, { l: 'Fat', v: result.fat, c: 'var(--red)' }].map(m => (
                    <div key={m.l} style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: m.c, textTransform: 'uppercase', marginBottom: 3 }}>{m.l}</div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{m.v}g</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ background: 'var(--green-bg)', borderRadius: 16, padding: '14px 16px', border: '1.5px solid var(--border)', marginBottom: 24 }}>
              <p style={{ fontSize: 12, color: 'var(--green)', lineHeight: 1.6 }}>Uses the Mifflin-St Jeor equation - the most accurate formula for estimating daily calorie needs.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
