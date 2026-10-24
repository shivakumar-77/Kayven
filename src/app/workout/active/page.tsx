'use client'
import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { EXERCISES } from '@/lib/exercises'

// ── Plate calculator ─────────────────────────────────────
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]
const BAR_WEIGHT = 20

function calcPlates(totalKg: number): { plate: number; count: number }[] {
  let remaining = Math.max(0, (totalKg - BAR_WEIGHT) / 2)
  const result: { plate: number; count: number }[] = []
  for (const p of PLATES) {
    const count = Math.floor(remaining / p)
    if (count > 0) { result.push({ plate: p, count }); remaining -= count * p }
  }
  return result
}

// ── 1RM estimate (Epley formula) ─────────────────────────
function oneRM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

// ── Timer hook ───────────────────────────────────────────
function useTimer(running: boolean, initial = 0) {
  const [elapsed, setElapsed] = useState(initial)
  const ref = useRef<any>(null)
  useEffect(() => {
    if (running) ref.current = setInterval(() => setElapsed(e => e + 1), 1000)
    else clearInterval(ref.current)
    return () => clearInterval(ref.current)
  }, [running])
  return elapsed
}

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

// ── Presentation-only helpers (new) ───────────────────────
function RestRing({ remaining, total, size = 92, strokeWidth = 7 }: { remaining: number; total: number; size?: number; strokeWidth?: number }) {
  const pct = total > 0 ? Math.min(1, remaining / total) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#fff" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
        {fmt(remaining)}
      </div>
    </div>
  )
}

const IconX = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
)
const IconBarbell = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="7" width="6" height="10" rx="1.5" /><path d="M4 10v4M2 9v6M20 10v4M22 9v6" /></svg>
)
const IconTrophy = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3a2 2 0 0 1-2 4M7 5H4a2 2 0 0 0 2 4" /></svg>
)
const IconBulb = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a6 6 0 0 0-4 10.5c.6.5 1 1.3 1 2.5h6c0-1.2.4-2 1-2.5A6 6 0 0 0 12 2Z" /></svg>
)
const IconPlus = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)
const IconMinus = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
)

function ActiveWorkoutPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [name, setName] = useState('My Workout')
  const [exercises, setExercises] = useState<any[]>([])
  const [startTime] = useState(Date.now())
  const [timerRunning, setTimerRunning] = useState(true)
  const elapsed = useTimer(timerRunning, 0)
  const [showExPicker, setShowExPicker] = useState(false)
  const [exSearch, setExSearch] = useState('')
  const [exCat, setExCat] = useState('All')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [restActive, setRestActive] = useState(false)
  const [restTotal, setRestTotal] = useState(120)
  const [restElapsed, setRestElapsed] = useState(0)
  const restRef = useRef<any>(null)
  const [selectedEx, setSelectedEx] = useState<number | null>(null)
  const [showPlateCalc, setShowPlateCalc] = useState<number | null>(null)
  const [prFlash, setPrFlash] = useState<string | null>(null)
  const [previousData, setPreviousData] = useState<Record<string, any[]>>({})
  const [prs, setPRs] = useState<Record<string, any>>({})
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    init()
    return () => clearInterval(restRef.current)
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    setUserId(user.id)

    // Load PRs
    const { data: prData } = await supabase.from('exercise_prs')
      .select('*').eq('user_id', user.id)
    if (prData) {
      const prMap: Record<string, any> = {}
      prData.forEach(p => { prMap[p.exercise_id] = p })
      setPRs(prMap)
    }

    // Load previous workout data for each exercise
    const { data: prevLogs } = await supabase.from('workout_logs')
      .select('exercises').eq('user_id', user.id)
      .order('started_at', { ascending: false }).limit(10)

    const prevMap: Record<string, any[]> = {}
    if (prevLogs) {
      prevLogs.forEach(log => {
        ;(log.exercises || []).forEach((ex: any) => {
          if (!prevMap[ex.id] && ex.sets?.length) prevMap[ex.id] = ex.sets
        })
      })
    }
    setPreviousData(prevMap)

    // Restore active or load template
    const templateId = params.get('template')
    if (templateId) {
      const { data: tmpl } = await supabase.from('workout_templates')
        .select('*').eq('id', templateId).single()
      if (tmpl) {
        setName(tmpl.name)
        setExercises((tmpl.exercises || []).map((e: any) => ({
          ...e, uid: Math.random(),
          sets: (e.sets_config || Array.from({ length: e.sets || 3 }, (_, i) => ({
            weight: previousData[e.id]?.[i]?.weight || '',
            reps: String(e.reps || 8), done: false
          })))
        })))
        return
      }
    }
    const saved = localStorage.getItem('Kayven_active_workout')
    if (saved && !templateId) {
      try {
        const w = JSON.parse(saved)
        setName(w.name || 'My Workout')
        setExercises(w.exercises || [])
      } catch {}
    }
  }

  // Save to localStorage on change
  useEffect(() => {
    if (exercises.length > 0 || name !== 'My Workout') {
      localStorage.setItem('Kayven_active_workout', JSON.stringify({ name, exercises, startedAt: startTime }))
    }
  }, [name, exercises])

  // Rest timer
  function startRest(seconds: number) {
    clearInterval(restRef.current)
    setRestTotal(seconds); setRestElapsed(0); setRestActive(true)
    let e = 0
    restRef.current = setInterval(() => {
      e++; setRestElapsed(e)
      if (e >= seconds) { clearInterval(restRef.current); setRestActive(false) }
    }, 1000)
  }

  function updateSet(exIdx: number, setIdx: number, field: string, val: any) {
    setExercises(p => p.map((e, i) => i !== exIdx ? e : {
      ...e, sets: e.sets.map((s: any, j: number) => j !== setIdx ? s : { ...s, [field]: val })
    }))
  }

  async function toggleDone(exIdx: number, setIdx: number) {
    const ex = exercises[exIdx]
    const set = ex.sets[setIdx]
    const nowDone = !set.done
    updateSet(exIdx, setIdx, 'done', nowDone)

    if (nowDone && set.weight && set.reps) {
      startRest(120)
      // Check PR
      const w = parseFloat(set.weight), r = parseInt(set.reps)
      if (w > 0 && r > 0 && userId) {
        const est = oneRM(w, r)
        const current = prs[ex.id]
        if (!current || est > current.one_rm_estimate) {
          // New PR!
          await supabase.from('exercise_prs').upsert({
            user_id: userId, exercise_id: ex.id, exercise_name: ex.name,
            weight_kg: w, reps: r, one_rm_estimate: est, achieved_at: new Date().toISOString()
          }, { onConflict: 'user_id,exercise_id' })
          setPRs(p => ({ ...p, [ex.id]: { weight_kg: w, reps: r, one_rm_estimate: est } }))
          setPrFlash(`🏆 New PR! ${ex.name} — ${est}kg 1RM est.`)
          setTimeout(() => setPrFlash(null), 3500)
        }
      }
    }
  }

  function addSet(exIdx: number) {
    setExercises(p => p.map((e, i) => i !== exIdx ? e : {
      ...e, sets: [...e.sets, {
        weight: e.sets[e.sets.length - 1]?.weight || '',
        reps: e.sets[e.sets.length - 1]?.reps || '8',
        done: false
      }]
    }))
  }

  function removeSet(exIdx: number, setIdx: number) {
    setExercises(p => p.map((e, i) => i !== exIdx ? e : {
      ...e, sets: e.sets.filter((_: any, j: number) => j !== setIdx)
    }))
  }

  function removeExercise(exIdx: number) {
    setExercises(p => p.filter((_, i) => i !== exIdx))
  }

  function addExercise(ex: any) {
    const prev = previousData[ex.id] || []
    setExercises(p => [...p, {
      ...ex, uid: Math.random(),
      sets: Array.from({ length: ex.sets || 3 }, (_, i) => ({
        weight: prev[i]?.weight || '', reps: prev[i]?.reps || String(ex.reps || 8), done: false
      }))
    }])
    setShowExPicker(false)
  }

  function totalVolume() {
    return Math.round(exercises.reduce((t, ex) =>
      t + ex.sets.filter((s: any) => s.done && s.weight && s.reps)
        .reduce((s: number, set: any) => s + (parseFloat(set.weight) || 0) * (parseFloat(set.reps) || 0), 0)
    , 0))
  }

  async function finishWorkout() {
    setSaving(true)
    setSaveError('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) { router.replace('/auth'); return }
      const { error } = await supabase.from('workout_logs').insert({
        user_id: user.id, name,
        started_at: new Date(startTime).toISOString(),
        finished_at: new Date().toISOString(),
        duration_seconds: elapsed,
        total_volume_kg: totalVolume(),
        exercises
      })
      if (error) throw error
      localStorage.removeItem('Kayven_active_workout')
      router.push('/workout')
    } catch (error) {
      console.error('[Workout] Failed to save workout', error)
      setSaveError('Workout was not saved. Your active workout is still available; please retry.')
    } finally {
      setSaving(false)
    }
  }

  const completedSets = exercises.reduce((s, e) => s + e.sets.filter((s: any) => s.done).length, 0)
  const totalSets = exercises.reduce((s, e) => s + e.sets.length, 0)
  const restRemaining = Math.max(0, restTotal - restElapsed)
  const restPct = restActive ? restElapsed / restTotal : 0

  const CATS = ['All','Core','Arms','Back','Chest','Legs','Shoulders','Olympic','Full Body','Cardio']
  const filteredEx = EXERCISES.filter(e =>
    (exCat === 'All' || e.category === exCat) &&
    (!exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase()) || e.muscle.toLowerCase().includes(exSearch.toLowerCase()))
  )

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 24 }}>
      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in-up { animation: fadeInUp 0.4s cubic-bezier(.4,0,.2,1) both; }
      `}</style>

      {/* PR Flash — text/emoji left exactly as generated by toggleDone(), only the container is restyled */}
      {prFlash && (
        <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top,0px) + 16px)', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,var(--orange),color-mix(in srgb, var(--orange) 75%, black))', color: '#fff', padding: '12px 20px', borderRadius: 99, fontSize: 13, fontWeight: 700, zIndex: 500, boxShadow: '0 8px 24px color-mix(in srgb, var(--orange) 40%, transparent)', animation: 'slideDown 0.3s ease', whiteSpace: 'nowrap' }}>
          {prFlash}
        </div>
      )}

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--surface)', padding: 'calc(env(safe-area-inset-top,0px) + 10px) 16px 12px', borderBottom: '0.5px solid var(--border)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={() => { if (confirm('Discard this workout?')) { localStorage.removeItem('Kayven_active_workout'); router.push('/workout') } }}
            className="press-effect"
            style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--card2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}>
            <IconX size={15}/>
          </button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: timerRunning ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(elapsed)}
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 5, justifyContent: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, background: 'var(--card2)', padding: '2px 7px', borderRadius: 6 }}>{completedSets}/{totalSets} sets</div>
              <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700, background: 'var(--primary-bg)', padding: '2px 7px', borderRadius: 6 }}>{totalVolume()} kg</div>
            </div>
          </div>

          <button onClick={finishWorkout} disabled={saving || exercises.length === 0} className="press-effect"
            style={{ background: 'var(--green)', border: 'none', borderRadius: 99, padding: '10px 20px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: exercises.length === 0 ? 0.5 : 1, boxShadow: '0 4px 14px -4px color-mix(in srgb, var(--green) 50%, transparent)' }}>
            {saving ? '…' : 'Finish'}
          </button>
        </div>
        {saveError && <p role="alert" style={{ color: '#dc2626', fontSize: 13, margin: '8px 0', textAlign: 'center' }}>{saveError}</p>}

        {/* Progress bar */}
        <div style={{ height: 4, background: 'var(--card2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--primary),var(--green))', width: totalSets > 0 ? `${Math.round(completedSets / totalSets * 100)}%` : '0%', transition: 'width 0.4s ease', borderRadius: 2 }} />
        </div>
      </div>

      {/* Rest timer — circular countdown ring, driven by the same restRemaining/restTotal state */}
      {restActive && (
        <div className="fade-in-up" style={{ margin: '12px 16px 0', background: 'linear-gradient(135deg,var(--blue),color-mix(in srgb, var(--blue) 70%, black))', borderRadius: 20, padding: '16px 18px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
          <RestRing remaining={restRemaining} total={restTotal} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Rest timer</div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
              {[30, 60, 90, 120].map(s => (
                <button key={s} onClick={() => startRest(s)} className="press-effect"
                  style={{ padding: '5px 10px', borderRadius: 8, background: restTotal === s ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {s}s
                </button>
              ))}
            </div>
            <button onClick={() => { clearInterval(restRef.current); setRestActive(false) }} className="press-effect"
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '5px 12px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
              Skip
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 16px' }}>
        {/* Workout name */}
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ fontSize: 23, fontWeight: 800, background: 'transparent', border: 'none', borderBottom: '2px solid var(--border)', padding: '0 0 10px', width: '100%', outline: 'none', color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 16 }} />

        {/* Exercises */}
        {exercises.map((ex, exIdx) => {
          const prev = previousData[ex.id] || []
          const pr = prs[ex.id]
          const exVol = Math.round(ex.sets.filter((s: any) => s.done && s.weight && s.reps)
            .reduce((s: number, set: any) => s + parseFloat(set.weight) * parseFloat(set.reps), 0))
          const plateWeight = parseFloat(ex.sets.find((s: any) => s.weight)?.weight || '0')
          const plates = plateWeight >= BAR_WEIGHT ? calcPlates(plateWeight) : []

          return (
            <div key={ex.uid || exIdx} className="fade-in-up" style={{ background: 'var(--card)', borderRadius: 22, border: '1px solid var(--border)', marginBottom: 14, overflow: 'hidden', boxShadow: 'var(--shadow-md)', animationDelay: `${Math.min(exIdx, 6) * 0.04}s` }}>
              {/* Exercise header */}
              <div style={{ padding: '15px 16px', background: 'var(--card2)', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button onClick={() => setSelectedEx(selectedEx === exIdx ? null : exIdx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>{ex.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{ex.category} · {ex.muscle}</div>
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    {pr && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: 'var(--orange-bg)', borderRadius: 8, fontSize: 10, fontWeight: 700, color: 'var(--orange)' }}>
                        <IconTrophy size={10}/> {pr.one_rm_estimate}kg
                      </div>
                    )}
                    {exVol > 0 && (
                      <div style={{ padding: '3px 8px', background: 'var(--primary-bg)', borderRadius: 8, fontSize: 10, fontWeight: 700, color: 'var(--primary)' }}>
                        {exVol}kg
                      </div>
                    )}
                    <button onClick={() => setShowPlateCalc(showPlateCalc === exIdx ? null : exIdx)} className="press-effect"
                      style={{ width: 30, height: 30, borderRadius: 9, background: showPlateCalc === exIdx ? 'var(--primary)' : 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: showPlateCalc === exIdx ? '#fff' : 'var(--muted)' }}>
                      <IconBarbell size={14}/>
                    </button>
                    <button onClick={() => removeExercise(exIdx)} className="press-effect"
                      style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--red-bg)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
                      <IconX size={13}/>
                    </button>
                  </div>
                </div>
              </div>

              {/* Plate calculator */}
              {showPlateCalc === exIdx && plateWeight > 0 && (
                <div className="fade-in-up" style={{ padding: '16px', background: '#1e1b4b', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Plate calculator
                    </div>
                    <div style={{ fontSize: 16, color: '#fff', fontWeight: 800 }}>{plateWeight}kg</div>
                  </div>
                  {/* Bar visual */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, marginBottom: 14, minHeight: 48 }}>
                    {/* Left plates */}
                    {[...calcPlates(plateWeight)].reverse().map((p, i) => (
                      Array.from({ length: p.count }).map((_, j) => (
                        <div key={`l-${i}-${j}`} style={{
                          width: p.plate >= 20 ? 14 : p.plate >= 10 ? 12 : 10,
                          height: p.plate >= 20 ? 46 : p.plate >= 10 ? 38 : 30,
                          background: p.plate >= 20 ? 'var(--blue)' : p.plate >= 10 ? 'var(--green)' : p.plate >= 5 ? 'var(--orange)' : 'var(--primary)',
                          borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <span style={{ fontSize: 7, color: '#fff', fontWeight: 700, writingMode: 'vertical-rl' }}>{p.plate}</span>
                        </div>
                      ))
                    ))}
                    {/* Bar */}
                    <div style={{ width: 64, height: 9, background: '#94a3b8', borderRadius: 5 }} />
                    {/* Right plates */}
                    {calcPlates(plateWeight).map((p, i) => (
                      Array.from({ length: p.count }).map((_, j) => (
                        <div key={`r-${i}-${j}`} style={{
                          width: p.plate >= 20 ? 14 : p.plate >= 10 ? 12 : 10,
                          height: p.plate >= 20 ? 46 : p.plate >= 10 ? 38 : 30,
                          background: p.plate >= 20 ? 'var(--blue)' : p.plate >= 10 ? 'var(--green)' : p.plate >= 5 ? 'var(--orange)' : 'var(--primary)',
                          borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <span style={{ fontSize: 7, color: '#fff', fontWeight: 700, writingMode: 'vertical-rl' }}>{p.plate}</span>
                        </div>
                      ))
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontSize: 11, color: '#a5b4fc', padding: '4px 10px', background: 'rgba(255,255,255,0.1)', borderRadius: 8, fontWeight: 600 }}>
                      Bar {BAR_WEIGHT}kg
                    </div>
                    {calcPlates(plateWeight).map((p, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#fff', padding: '4px 10px', background: 'rgba(255,255,255,0.15)', borderRadius: 8, fontWeight: 600 }}>
                        {p.count}×{p.plate}kg each side
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Instructions panel */}
              {selectedEx === exIdx && (
                <div className="fade-in-up" style={{ padding: '14px 16px', background: 'var(--primary-bg)', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>How to perform</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, marginBottom: 10 }}>{ex.instructions}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11, color: 'var(--orange)', fontWeight: 600, background: 'var(--orange-bg)', padding: '9px 11px', borderRadius: 10 }}>
                    <IconBulb size={12}/> <span>{ex.tips}</span>
                  </div>
                </div>
              )}

              {/* Set headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 72px 72px 34px', gap: 6, padding: '9px 14px', background: 'var(--card2)', borderBottom: '0.5px solid var(--border)' }}>
                {['Set', 'Previous', 'kg', 'Reps', ''].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</div>
                ))}
              </div>

              {/* Sets */}
              {ex.sets.map((set: any, setIdx: number) => {
                const prevSet = prev[setIdx]
                const setVol = set.done && set.weight && set.reps ? parseFloat(set.weight) * parseFloat(set.reps) : 0
                const est1rm = set.done && set.weight && set.reps ? oneRM(parseFloat(set.weight), parseInt(set.reps)) : 0
                const isPR = set.done && est1rm > 0 && (!prs[ex.id] || est1rm >= prs[ex.id].one_rm_estimate)
                return (
                  <div key={setIdx}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '26px 1fr 72px 72px 34px', gap: 6,
                      padding: '9px 14px', alignItems: 'center',
                      background: set.done ? 'color-mix(in srgb, var(--green) 7%, transparent)' : 'transparent',
                      transition: 'background 0.3s'
                    }}>
                      {/* Set number */}
                      <div style={{ width: 24, height: 24, borderRadius: 7, background: set.done ? 'var(--green)' : 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: set.done ? '#fff' : 'var(--muted)' }}>
                        {setIdx + 1}
                      </div>

                      {/* Previous */}
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>
                        {prevSet ? <span style={{ fontWeight: 600 }}>{prevSet.weight}×{prevSet.reps}</span> : '—'}
                        {isPR && set.done && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: 'var(--orange)', fontWeight: 700, marginTop: 1 }}>
                            <IconTrophy size={9}/> PR
                          </div>
                        )}
                      </div>

                      {/* Weight */}
                      <input type="text" inputMode="decimal" value={set.weight}
                        onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                        placeholder="0"
                        style={{
                          textAlign: 'center', fontWeight: 700, fontSize: 15,
                          background: set.done ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'var(--card2)',
                          border: '1.5px solid ' + (set.done ? 'var(--green)' : 'var(--border)'),
                          borderRadius: 10, padding: '8px 4px', color: 'var(--text)',
                          outline: 'none', transition: 'all 0.2s'
                        }} />

                      {/* Reps */}
                      <input type="text" inputMode="numeric" value={set.reps}
                        onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                        placeholder="0"
                        style={{
                          textAlign: 'center', fontWeight: 700, fontSize: 15,
                          background: set.done ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'var(--card2)',
                          border: '1.5px solid ' + (set.done ? 'var(--green)' : 'var(--border)'),
                          borderRadius: 10, padding: '8px 4px', color: 'var(--text)',
                          outline: 'none', transition: 'all 0.2s'
                        }} />

                      {/* Check */}
                      <button onClick={() => toggleDone(exIdx, setIdx)} className="press-effect"
                        style={{
                          width: 32, height: 32, borderRadius: 9,
                          background: set.done ? 'var(--green)' : 'var(--card2)',
                          border: '1.5px solid ' + (set.done ? 'var(--green)' : 'var(--border)'),
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: set.done ? '#fff' : 'var(--muted)', transition: 'all 0.2s',
                          animation: set.done ? 'checkPop 0.3s ease' : 'none'
                        }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </button>
                    </div>

                    {/* Set volume below */}
                    {set.done && setVol > 0 && (
                      <div style={{ padding: '0 14px 6px', fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
                        vol: {Math.round(setVol)}kg · 1RM est: {est1rm}kg
                      </div>
                    )}
                    {setIdx < ex.sets.length - 1 && <div style={{ height: '0.5px', background: 'var(--border)', margin: '0 14px' }} />}
                  </div>
                )
              })}

              {/* Add/remove set */}
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px 15px' }}>
                <button onClick={() => addSet(exIdx)} className="press-effect"
                  style={{ flex: 1, padding: '9px', borderRadius: 11, background: 'var(--card2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <IconPlus size={11}/> Add set
                </button>
                {ex.sets.length > 1 && (
                  <button onClick={() => removeSet(exIdx, ex.sets.length - 1)} className="press-effect"
                    style={{ padding: '9px 15px', borderRadius: 11, background: 'var(--red-bg)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IconMinus size={10}/> Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Add exercise */}
        <button onClick={() => setShowExPicker(true)} className="press-effect"
          style={{ width: '100%', padding: '16px', borderRadius: 20, background: 'var(--primary-bg)', border: '2px dashed var(--primary)', cursor: 'pointer', fontSize: 15, fontWeight: 700, color: 'var(--primary)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <IconPlus size={16}/> Add Exercise
        </button>

        {exercises.length === 0 && (
          <div className="fade-in-up" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--muted)' }}>
              <IconBarbell size={28}/>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Add exercises to start your workout</div>
          </div>
        )}
      </div>

      {/* Exercise picker */}
      {showExPicker && (
        <div className="modal-overlay">
          <div className="modal-sheet" style={{ maxHeight: '86dvh' }}>
            <div className="modal-handle" />
            <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>Add Exercise</div>
              <button onClick={() => setShowExPicker(false)} className="press-effect" style={{ background: 'var(--card2)', border: 'none', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                <IconX size={14}/>
              </button>
            </div>
            <div style={{ padding: '12px 16px 10px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
              <input type="text" placeholder="Search exercises…" value={exSearch} onChange={e => setExSearch(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {CATS.map(c => (
                  <button key={c} onClick={() => setExCat(c)} className="press-effect"
                    style={{ padding: '6px 13px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, border: '1.5px solid ' + (exCat === c ? 'var(--primary)' : 'var(--border)'), background: exCat === c ? 'var(--primary)' : 'transparent', color: exCat === c ? '#fff' : 'var(--muted)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredEx.map(ex => {
                const pr = prs[ex.id]
                const hasPrev = !!previousData[ex.id]
                return (
                  <button key={ex.id} onClick={() => addExercise(ex)} className="press-effect"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', background: 'none', border: 'none', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{ex.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{ex.category} · {ex.muscle}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                      {pr && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 7px', background: 'var(--orange-bg)', borderRadius: 7, fontSize: 9, fontWeight: 700, color: 'var(--orange)' }}>
                          <IconTrophy size={8}/> PR
                        </div>
                      )}
                      {hasPrev && <div style={{ padding: '2px 7px', background: 'var(--primary-bg)', borderRadius: 7, fontSize: 9, fontWeight: 700, color: 'var(--primary)' }}>PREV</div>}
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                        <IconPlus size={12}/>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ActiveWorkoutPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading workout…</div>}>
      <ActiveWorkoutPageContent />
    </Suspense>
  )
}
