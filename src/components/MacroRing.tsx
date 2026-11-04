'use client'

export default function MacroRing({ cal, calTarget, protein, proteinTarget, carb, carbTarget, fat, fatTarget, remaining }) {
  const pct = (v, t) => Math.min(1, v / t)
  const over = cal > calTarget

  return (
    <div style={{ position: 'relative', width: 200, height: 200 }}>
      <svg width="200" height="200" viewBox="0 0 200 200">
        {/* Outer cal ring */}
        <circle cx="100" cy="100" r="86" fill="none" stroke="var(--card3)" strokeWidth="10" />
        <circle cx="100" cy="100" r="86" fill="none"
          stroke={over ? 'var(--red)' : 'var(--primary)'} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 86}`}
          strokeDashoffset={2 * Math.PI * 86 * (1 - pct(cal, calTarget))}
          style={{ transformOrigin: '100px 100px', transform: 'rotate(-90deg)', transition: 'stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)' }} />
        {/* Protein ring */}
        <circle cx="100" cy="100" r="68" fill="none" stroke="var(--card3)" strokeWidth="8" />
        <circle cx="100" cy="100" r="68" fill="none"
          stroke="var(--protein)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 68}`}
          strokeDashoffset={2 * Math.PI * 68 * (1 - pct(protein, proteinTarget))}
          style={{ transformOrigin: '100px 100px', transform: 'rotate(-90deg)', transition: 'stroke-dashoffset 0.8s 0.1s cubic-bezier(0.34,1.56,0.64,1)' }} />
        {/* Carb ring */}
        <circle cx="100" cy="100" r="52" fill="none" stroke="var(--card3)" strokeWidth="8" />
        <circle cx="100" cy="100" r="52" fill="none"
          stroke="var(--carbs)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 52}`}
          strokeDashoffset={2 * Math.PI * 52 * (1 - pct(carb, carbTarget))}
          style={{ transformOrigin: '100px 100px', transform: 'rotate(-90deg)', transition: 'stroke-dashoffset 0.8s 0.2s cubic-bezier(0.34,1.56,0.64,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: over ? 'var(--red)' : 'var(--text)' }}>{Math.round(cal)}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>kcal eaten</div>
        <div style={{ fontSize: 13, marginTop: 6, fontWeight: 600, color: over ? 'var(--red)' : 'var(--primary)' }}>
          {over ? `${Math.round(cal - calTarget)} over` : `${Math.round(remaining)} left`}
        </div>
      </div>
    </div>
  )
}
