// @ts-nocheck
'use client'
import { useState, useRef } from 'react'

const PRESETS = [100, 150, 200, 250, 300, 350, 400, 500, 750, 1000]

export default function WaterTracker({ waterGoal = 2000 }) {
  const [totalMl, setTotalMl] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(2)
  const [logs, setLogs] = useState([])
  const [customMl, setCustomMl] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const startY = useRef(0)
  const ITEM_H = 48

  function onDragStart(y) { startY.current = y }
  function onDragEnd(y) {
    const diff = startY.current - y
    if (Math.abs(diff) < 8) return
    if (diff > 15) setSelectedIdx(i => Math.min(PRESETS.length - 1, i + 1))
    if (diff < -15) setSelectedIdx(i => Math.max(0, i - 1))
  }

  function addWater(ml) {
    const amount = ml || PRESETS[selectedIdx]
    setTotalMl(prev => Math.min(waterGoal, prev + amount))
    setLogs(prev => [{ ml: amount, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 6))
    setShowCustom(false)
    setCustomMl('')
  }

  function addCustom() {
    const val = parseInt(customMl)
    if (val && val > 0 && val <= 3000) addWater(val)
  }

  const pct = Math.min(1, totalMl / waterGoal)
  const reached = totalMl >= waterGoal
  const waterColor = reached ? 'var(--green)' : 'var(--water)'
  const waveLighter = reached ? 'color-mix(in srgb, var(--green) 78%, white)' : 'color-mix(in srgb, var(--water) 78%, white)'
  const GW = 90, GH = 180
  const fillH = Math.round((GH - 20) * pct)
  const fillY = GH - 10 - fillH

  return (
    <div className="card" style={{ marginTop: 12, padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Hydration</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            <span style={{ fontWeight: 700, color: reached ? 'var(--green)' : 'var(--primary)' }}>{totalMl}ml</span> of {waterGoal}ml
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 99, background: reached ? 'var(--green-bg)' : 'var(--primary-bg)', color: reached ? 'var(--green)' : 'var(--primary)' }}>
          {reached ? '🎉 Goal reached!' : `${waterGoal - totalMl}ml to go`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {/* Glass */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <svg width={GW} height={GH} viewBox={`0 0 ${GW} ${GH}`}>
            <defs>
              <clipPath id="wt-clip">
                <path d={`M8 8 L4 ${GH-8} Q4 ${GH} 8 ${GH} L${GW-8} ${GH} Q${GW-4} ${GH} ${GW-4} ${GH-8} L${GW-8} 8 Z`} />
              </clipPath>
            </defs>
            <path d={`M8 8 L4 ${GH-8} Q4 ${GH} 8 ${GH} L${GW-8} ${GH} Q${GW-4} ${GH} ${GW-4} ${GH-8} L${GW-8} 8 Z`}
              fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5" />
            <g clipPath="url(#wt-clip)">
              {pct > 0 && <>
                <rect x="4" y={fillY + 8} width={GW-8} height={Math.max(0,fillH)}
                  fill={waterColor} opacity="0.75"
                  style={{ transition: 'y 0.7s cubic-bezier(0.34,1.56,0.64,1), height 0.7s cubic-bezier(0.34,1.56,0.64,1)' }} />
                <ellipse cx={GW/2} cy={fillY+8} rx={GW/2-4} ry="6"
                  fill={waveLighter} opacity="0.8"
                  style={{ transition: 'cy 0.7s cubic-bezier(0.34,1.56,0.64,1)', animation: 'wv 2.5s ease-in-out infinite' }} />
                {pct > 0.2 && <>
                  <circle cx="22" cy={fillY+30} r="2.5" fill="rgba(255,255,255,0.4)" style={{ animation: 'b1 2.2s ease-in-out infinite' }} />
                  <circle cx="60" cy={fillY+50} r="2" fill="rgba(255,255,255,0.3)" style={{ animation: 'b2 3s ease-in-out infinite 0.8s' }} />
                  <circle cx="40" cy={fillY+70} r="1.5" fill="rgba(255,255,255,0.25)" style={{ animation: 'b1 3.5s ease-in-out infinite 1.5s' }} />
                </>}
              </>}
            </g>
            <path d={`M8 8 L4 ${GH-8} Q4 ${GH} 8 ${GH} L${GW-8} ${GH} Q${GW-4} ${GH} ${GW-4} ${GH-8} L${GW-8} 8 Z`}
              fill="none" stroke="var(--border)" strokeWidth="1.5" />
            <path d="M16 12 L12 55" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" />
            {pct > 0.15 && (
              <text x={GW/2} y={fillY + Math.max(22, fillH/2 + 6)} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--primary-contrast)" opacity="0.95">
                {Math.round(pct*100)}%
              </text>
            )}
          </svg>
          {totalMl > 0 && (
            <button onClick={() => { setTotalMl(0); setLogs([]) }}
              style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              reset
            </button>
          )}
        </div>

        {/* Scroll picker + button */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, textAlign: 'center' }}>Scroll to select</div>
            <div style={{ position: 'relative', height: ITEM_H*3, overflow: 'hidden', borderRadius: 16, background: 'var(--surface)', border: '1.5px solid var(--border)', cursor: 'ns-resize', userSelect: 'none' }}
              onTouchStart={e=>onDragStart(e.touches[0].clientY)}
              onTouchEnd={e=>onDragEnd(e.changedTouches[0].clientY)}
              onMouseDown={e=>onDragStart(e.clientY)}
              onMouseUp={e=>onDragEnd(e.clientY)}>
              <div style={{ position: 'absolute', top: ITEM_H, left: 0, right: 0, height: ITEM_H, background: 'var(--primary-bg)', borderTop: '2px solid var(--primary)', borderBottom: '2px solid var(--primary)', zIndex: 1, borderRadius: 8, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', width: '100%', transition: 'transform 0.2s cubic-bezier(0.34,1.2,0.64,1)', transform: `translateY(${(1-selectedIdx)*ITEM_H}px)` }}>
                {PRESETS.map((ml, i) => {
                  const d = Math.abs(i - selectedIdx)
                  return (
                    <div key={ml} onClick={() => setSelectedIdx(i)}
                      style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', transition: 'all 0.15s', opacity: d===0?1:d===1?0.45:0.15, transform: `scale(${d===0?1:d===1?0.88:0.75})` }}>
                      <span style={{ fontSize: d===0?22:17, fontWeight: d===0?700:500, color: d===0?'var(--primary)':'var(--muted)' }}>{ml}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>ml</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H, background: 'linear-gradient(to bottom,var(--surface),transparent)', pointerEvents: 'none', zIndex: 2 }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H, background: 'linear-gradient(to top,var(--surface),transparent)', pointerEvents: 'none', zIndex: 2 }} />
              <div style={{ position: 'absolute', top: 5, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'var(--muted)', zIndex: 3, pointerEvents: 'none' }}>▲</div>
              <div style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'var(--muted)', zIndex: 3, pointerEvents: 'none' }}>▼</div>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700 }} onClick={() => addWater()}>
            + Add {PRESETS[selectedIdx]}ml
          </button>

          {logs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {logs.map((l, i) => (
                <div key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: 'var(--primary-bg)', color: 'var(--primary)', fontWeight: 600 }}>+{l.ml}ml</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 16, height: 6, background: 'var(--card2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: waterColor, width: `${pct*100}%`, transition: 'width 0.6s ease' }} />
      </div>

      {/* Custom ml - centered */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {!showCustom ? (
          <button onClick={() => setShowCustom(true)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14 }}>+</span> Add custom amount
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 280 }}>
            <input type="number" placeholder="e.g. 330ml" value={customMl}
              onChange={e => setCustomMl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
              style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 15 }}
              autoFocus />
            <button className="btn btn-primary" onClick={addCustom} style={{ flexShrink: 0, padding: '10px 16px', fontSize: 13, fontWeight: 700 }}>Add</button>
            <button onClick={() => { setShowCustom(false); setCustomMl('') }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes wv{0%,100%{rx:40px;ry:6px}50%{rx:38px;ry:8px}}
        @keyframes b1{0%,100%{transform:translateY(0);opacity:.35}50%{transform:translateY(-10px);opacity:.7}}
        @keyframes b2{0%,100%{transform:translateY(0);opacity:.25}50%{transform:translateY(-8px);opacity:.55}}
      `}</style>
    </div>
  )
}
