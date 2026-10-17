'use client'

import { perfMark, perfTime, perfReport } from '@/lib/perf'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BoltIcon, ChevronRightIcon } from '@/lib/icons'

interface Action {
  actionType: string
  priority: number
  title?: string
  message?: string
  suggestedAction?: string
  destination?: string
}

interface Props {
  profile: any
  logs: any[]
  waterMl: number
}

const COOLDOWN_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 5000
const STORAGE_KEY = 'Kayven_next_action'
const sessionCache = new Map<string, Action>()

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function fallbackAction(profile: any, logs: any[], waterMl: number): Action {
  const calories = logs.reduce((sum, log) => sum + number(log.cal), 0)
  const protein = logs.reduce((sum, log) => sum + number(log.protein), 0)
  const calorieTarget = number(profile?.cal_target)
  const proteinTarget = number(profile?.protein_target)
  const waterTarget = number(profile?.water_goal)
  const proteinRemaining = proteinTarget - protein
  const caloriesRemaining = calorieTarget - calories
  const overallOnTrack = calories >= calorieTarget * 0.75 && calories <= calorieTarget * 1.05 && protein >= proteinTarget * 0.85 && (waterTarget <= 0 || waterMl >= waterTarget * 0.8)

  if (!logs.length) return { actionType:'LOG_MEAL', priority:0.8, title:'Log your next meal', message:'Nothing has been logged today yet.', suggestedAction:'Start with your next meal or snack.', destination:'/log' }
  if (waterTarget > 0 && waterMl < waterTarget * 0.6) return { actionType:'HYDRATION', priority:0.84, title:'Top up your hydration', message:`You have logged ${Math.round(waterMl)}ml of your ${Math.round(waterTarget)}ml water target today.`, suggestedAction:`Drink about ${Math.round(waterTarget - waterMl)}ml more today.`, destination:'/water' }
  if (proteinRemaining >= 25 && caloriesRemaining >= 150) return { actionType:'PROTEIN', priority:0.72, title:'Close your protein gap', message:`You are about ${Math.round(proteinRemaining)}g short of your protein target today.`, suggestedAction:`Log a protein-focused meal within your remaining ${Math.round(caloriesRemaining)} calories.`, destination:'/log' }
  if (calorieTarget > 0 && caloriesRemaining > 200 && !overallOnTrack) return { actionType:'NUTRITION', priority:0.68, title:'Plan your next meal', message:`You have about ${Math.round(caloriesRemaining)} calories remaining today.`, suggestedAction:'Choose a balanced meal that fits your remaining calories.', destination:'/meal-plan' }
  if (calorieTarget > 0 && caloriesRemaining <= 100 && proteinRemaining > 20) return { actionType:'NONE', priority:0 }
  if (overallOnTrack) return { actionType:'PROGRESS', priority:0.4, title:'You are on track today', message:'Your logged nutrition and hydration are tracking well against your targets.', suggestedAction:'Keep the consistency going.', destination:'/insights' }
  return { actionType:'NONE', priority:0 }
}

export default function NextBestActionCard({ profile, logs, waterMl }: Props) {
  const router = useRouter()
  const [action, setAction] = useState<Action | null>(null)
  const [loading, setLoading] = useState(true)
  const fingerprint = JSON.stringify({
    userId: profile?.id,
    profile: { cal: profile?.cal_target, protein: profile?.protein_target, water: profile?.water_goal },
    logs: logs.map(log => [log.id, log.cal, log.protein, log.carb, log.fat]),
    waterMl
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const localFallback = fallbackAction(profile, logs, waterMl)
        const cachedInSession = sessionCache.get(fingerprint)
        if (cachedInSession) { setAction(cachedInSession); setLoading(false); return }
        const cached = localStorage.getItem(`${STORAGE_KEY}:${fingerprint}`)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed.expiresAt > Date.now()) { sessionCache.set(fingerprint, parsed.action); setAction(parsed.action); setLoading(false); return }
        }
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        perfMark('health-agent:start')
        let data
        try {
          data = await perfTime('health-agent.request', async () => {
            const response = await fetch('/api/health-agent', { signal: controller.signal })
            if (!response.ok) throw new Error('Recommendation unavailable')
            return response.json()
          })
          perfMark('health-agent:done')
        } finally {
          window.clearTimeout(timeout)
          perfMark('health-agent:done')
          perfReport('dashboard-health-agent')
        }
        if (!cancelled) {
          const nextAction = data.state?.action || localFallback
          sessionCache.set(fingerprint, nextAction)
          setAction(nextAction.actionType === 'NONE' ? null : nextAction)
          localStorage.setItem(`${STORAGE_KEY}:${fingerprint}`, JSON.stringify({ action: nextAction, expiresAt: Date.now() + COOLDOWN_MS }))
        }
      } catch {
        if (!cancelled) {
          const localFallback = fallbackAction(profile, logs, waterMl)
          setAction(localFallback.actionType === 'NONE' ? null : localFallback)
          sessionCache.set(fingerprint, localFallback)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [fingerprint, profile, logs, waterMl])

  if (loading) return (
    <section className="next-action-card" aria-label="Next for you" aria-busy="true">
      <div className="next-action-icon"><BoltIcon size={18} color="var(--primary)" strokeWidth={2.2}/></div>
      <div className="next-action-copy"><div className="next-action-label">Next for you</div><div className="next-action-skeleton title"/><div className="next-action-skeleton line"/><div className="next-action-skeleton short"/></div>
      <div className="next-action-skeleton action"/>
      <style jsx>{`.next-action-card { min-height:94px; }.next-action-skeleton { background:var(--card3); border-radius:6px; animation:nextActionPulse 1.2s ease-in-out infinite; }.next-action-skeleton.title { width:145px; height:16px; margin:2px 0 8px; }.next-action-skeleton.line { width:100%; max-width:310px; height:10px; }.next-action-skeleton.short { width:68%; height:9px; margin-top:6px; }.next-action-skeleton.action { width:32px; height:32px; margin-top:8px; border-radius:10px; } @keyframes nextActionPulse { 50% { opacity:.45; } }`}</style>
    </section>
  )

  if (!action) return null

  function openAction() {
    if (action?.destination) router.push(action.destination)
  }

  return (
    <section className="next-action-card" aria-label="Next for you">
      <div className="next-action-icon"><BoltIcon size={18} color="var(--primary)" strokeWidth={2.2}/></div>
      <div className="next-action-copy">
        <div className="next-action-label">Next for you</div>
        <h2>{action.title}</h2>
        <p>{action.message}</p>
        {action.suggestedAction && <div className="next-action-suggestion">{action.suggestedAction}</div>}
      </div>
      <button onClick={openAction} aria-label={action.title || 'Open recommendation'}><ChevronRightIcon size={19} color="var(--primary)" strokeWidth={2.3}/></button>
      <style jsx>{`
        .next-action-card { min-height:112px; display:flex; align-items:flex-start; gap:12px; margin:14px 0; padding:16px; border:1px solid color-mix(in srgb,var(--primary) 24%,var(--border)); border-radius:16px; background:var(--primary-bg); animation: nextActionIn .35s ease both; }
        .next-action-icon { width:34px; height:34px; flex:0 0 34px; display:grid; place-items:center; border-radius:11px; background:var(--card); }
        .next-action-copy { flex:1; min-width:0; }.next-action-label { color:var(--primary); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
        h2 { font-size:15px; margin:0 0 3px; font-weight:750; }.next-action-copy p { color:var(--text-2); font-size:12px; line-height:1.45; margin:0; }.next-action-suggestion { color:var(--muted); font-size:11px; line-height:1.4; margin-top:6px; }
        button { width:32px; height:32px; flex:0 0 32px; border:0; border-radius:10px; background:var(--card); display:grid; place-items:center; cursor:pointer; margin-top:8px; }
        @keyframes nextActionIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </section>
  )
}