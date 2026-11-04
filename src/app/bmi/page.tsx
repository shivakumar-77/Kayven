// @ts-nocheck
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'

export default function BMIPage() {
  const router = useRouter()
  const [gender, setGender] = useState('male')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [result, setResult] = useState(null)

  function calculate() {
    const h = parseFloat(height), w = parseFloat(weight)
    if (!h || !w) return
    const bmi = w / ((h / 100) ** 2)
    let category, color, advice
    if (bmi < 18.5) { category = 'Underweight'; color = 'var(--blue)'; advice = 'Focus on nutrient-dense foods and strength training to gain healthy weight.' }
    else if (bmi < 25) { category = 'Normal weight'; color = 'var(--green)'; advice = 'Great! Maintain balanced nutrition and regular exercise.' }
    else if (bmi < 30) { category = 'Overweight'; color = 'var(--orange)'; advice = 'A calorie deficit of 300–500 kcal/day with regular exercise can help.' }
    else if (bmi < 35) { category = 'Obese (Class I)'; color = 'var(--red)'; advice = 'Consult a healthcare provider for a structured diet and exercise plan.' }
    else { category = 'Obese (Class II+)'; color = 'var(--red)'; advice = 'Please consult a doctor. Medical supervision is recommended.' }
    const idealMin = (18.5 * ((h / 100) ** 2)).toFixed(1)
    const idealMax = (24.9 * ((h / 100) ** 2)).toFixed(1)
    const toLose = w > parseFloat(idealMax) ? (w - parseFloat(idealMax)).toFixed(1) : null
    const toGain = w < parseFloat(idealMin) ? (parseFloat(idealMin) - w).toFixed(1) : null
    setResult({ bmi: bmi.toFixed(1), category, color, advice, idealMin, idealMax, toLose, toGain })
  }

  const inp = { textAlign: 'center', fontWeight: 800, fontSize: 24, background: 'transparent', border: 'none', padding: 0, width: '100%', outline: 'none', color: 'var(--text)' }
  const box = { background: 'var(--card)', borderRadius: 16, padding: '16px 12px', border: '1.5px solid var(--border)', textAlign: 'center' }

  // Gauge: left=180deg right=0deg, BMI 10→180deg, BMI 40→0deg
  // Segments (left to right): Underweight 10-18.5, Normal 18.5-25, Overweight 25-30, Obese I 30-35, Obese II 35-40
  function bmiToAngle(bmi) {
    return 180 - Math.min(180, Math.max(0, ((bmi - 10) / 30) * 180))
  }

  function arcPath(cx, cy, r, startDeg, endDeg) {
    const toRad = d => d * Math.PI / 180
    const x1 = cx + r * Math.cos(toRad(startDeg))
    const y1 = cy - r * Math.sin(toRad(startDeg))
    const x2 = cx + r * Math.cos(toRad(endDeg))
    const y2 = cy - r * Math.sin(toRad(endDeg))
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
    const sweep = endDeg < startDeg ? 0 : 1
    return 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' ' + (sweep ? 0 : 1) + ' ' + x2 + ' ' + y2 + ' Z'
  }

  // Segments: from left (180deg) to right (0deg)
  // BMI 10=180deg, 18.5=132deg, 25=90deg, 30=60deg, 35=30deg, 40=0deg
  const segs = [
    { color: 'var(--blue)', label: 'Under', from: 180, to: 132 },   // Underweight
    { color: 'var(--green)', label: 'Normal', from: 132, to: 90 },   // Normal
    { color: 'var(--orange)', label: 'Over', from: 90, to: 60 },      // Overweight
    { color: 'var(--red)', label: 'Obese I', from: 60, to: 30 },   // Obese I
    { color: 'var(--red)', label: 'Obese II', from: 30, to: 0 },   // Obese II
  ]

  const cx = 150, cy = 140, r = 110, ri = 70
  const bmiVal = result ? parseFloat(result.bmi) : null
  const needleAngle = bmiVal ? bmiToAngle(bmiVal) : null

  function toRad(d) { return d * Math.PI / 180 }
  function needleEnd(angle, len) {
    return {
      x: cx + len * Math.cos(toRad(angle)),
      y: cy - len * Math.sin(toRad(angle))
    }
  }

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 100 }}>
      <PageHeader title="BMI Calculator" subtitle="Body Mass Index"/>

      <div style={{ padding: '0 20px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Gender</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[{ id: 'male', icon: '♂', label: 'Male' }, { id: 'female', icon: '♀', label: 'Female' }].map(g => (
              <button key={g.id} onClick={() => setGender(g.id)}
                style={{ flex: 1, padding: '20px', borderRadius: 20, border: '2px solid ' + (gender === g.id ? 'var(--primary)' : 'var(--border)'), background: gender === g.id ? 'var(--primary-bg)' : 'var(--card)', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 6, color: gender === g.id ? 'var(--primary)' : 'var(--muted)' }}>{g.icon}</div>
                <div style={{ fontWeight: 700, color: gender === g.id ? 'var(--primary)' : 'var(--muted)' }}>{g.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          <div style={box}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Height</div>
            <input type="text" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="170" style={inp}/>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>cm</div>
          </div>
          <div style={box}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Weight</div>
            <input type="text" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="70" style={inp}/>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>kg</div>
          </div>
          <div style={box}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Age</div>
            <input type="text" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} placeholder="25" style={inp}/>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>yrs</div>
          </div>
        </div>

        <button onClick={calculate} className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: 15, fontWeight: 700, marginBottom: 24 }}>
          Calculate BMI
        </button>

        {result && (
          <div className="slide-up">
            <div className="card" style={{ textAlign: 'center', marginBottom: 16, padding: '20px 16px 24px' }}>
              <svg width="100%" viewBox="0 0 300 170" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
                {/* Draw arc segments left→right: blue, green, yellow, orange-red, dark-red */}
                {segs.map((seg, i) => (
                  <path key={i} d={arcPath(cx, cy, r, seg.from, seg.to)} fill={seg.color}/>
                ))}

                {/* Inner white circle to create donut */}
                <circle cx={cx} cy={cy} r={ri} fill="var(--primary-contrast)"/>

                {/* Segment labels — positioned at midpoint of each arc, outside */}
                {segs.map((seg, i) => {
                  const mid = (seg.from + seg.to) / 2
                  const lr = r + 14
                  const lx = cx + lr * Math.cos(toRad(mid))
                  const ly = cy - lr * Math.sin(toRad(mid))
                  return (
                    <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                      fontSize="8.5" fontWeight="700" fill={seg.color}>
                      {seg.label}
                    </text>
                  )
                })}

                {/* Needle */}
                {needleAngle !== null && (() => {
                  const tip = needleEnd(needleAngle, ri - 8)
                  const base1 = needleEnd(needleAngle + 90, 6)
                  const base2 = needleEnd(needleAngle - 90, 6)
                  return (
                    <>
                      <polygon
                        points={tip.x + ',' + tip.y + ' ' + base1.x + ',' + base1.y + ' ' + base2.x + ',' + base2.y}
                        fill="var(--primary)"
                      />
                      <circle cx={cx} cy={cy} r="8" fill="var(--primary)"/>
                      <circle cx={cx} cy={cy} r="4" fill="var(--primary-contrast)"/>
                    </>
                  )
                })()}

                {/* BMI value in center */}
                <text x={cx} y={cy - 14} textAnchor="middle" fontSize="26" fontWeight="800" fill={result.color}>{result.bmi}</text>
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="var(--muted)" fontWeight="500">BMI</text>
                <text x={cx} y={cy + 18} textAnchor="middle" fontSize="12" fontWeight="700" fill={result.color}>{result.category}</text>

                {/* Scale labels at ends */}
                <text x="18" y={cy + 4} textAnchor="middle" fontSize="8" fill="var(--muted)">10</text>
                <text x={cx * 2 - 18} y={cy + 4} textAnchor="middle" fontSize="8" fill="var(--muted)">40</text>
              </svg>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Your results</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px', border: '1.5px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Ideal weight</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>{result.idealMin}–{result.idealMax} kg</div>
                </div>
                <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px', border: '1.5px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{result.toLose ? 'To lose' : result.toGain ? 'To gain' : 'Status'}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: result.toLose ? 'var(--red)' : result.toGain ? 'var(--blue)' : 'var(--green)' }}>
                    {result.toLose ? result.toLose + ' kg' : result.toGain ? result.toGain + ' kg' : '✓ Healthy'}
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--orange-bg)', borderRadius: 14, padding: '14px', border: '1.5px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', marginBottom: 4 }}>💡 Advice</div>
                <div style={{ fontSize: 13, color: 'var(--orange)', lineHeight: 1.6 }}>{result.advice}</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>BMI chart</div>
              {[
                { label: 'Underweight', range: '< 18.5', color: 'var(--blue)' },
                { label: 'Normal weight', range: '18.5–24.9', color: 'var(--green)' },
                { label: 'Overweight', range: '25–29.9', color: 'var(--orange)' },
                { label: 'Obese Class I', range: '30–34.9', color: 'var(--red)' },
                { label: 'Obese Class II+', range: '≥ 35', color: 'var(--red)' },
              ].map((r, i, arr) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }}/>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{r.range}</div>
                  {result.category === r.label && <div style={{ fontSize: 10, fontWeight: 700, background: r.color, color: 'var(--primary-contrast)', padding: '3px 10px', borderRadius: 99 }}>YOU</div>}
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--green-bg)', borderRadius: 16, padding: '14px 16px', border: '1.5px solid var(--border)', marginBottom: 24 }}>
              <p style={{ fontSize: 12, color: 'var(--green)', lineHeight: 1.6 }}>⚠️ BMI is a screening tool, not a diagnostic measure. Consult a healthcare professional for a complete assessment.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
