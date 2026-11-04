'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { ACHIEVEMENTS, RARITY_COLORS, WEEKLY_CHALLENGES } from '@/lib/achievements'
import { checkAndAwardAchievements, updateStreak } from '@/lib/gamification'
import { calculateWeeklyChallengeProgress } from '@/lib/challenge-progress'
import { PageLoader } from '@/components/Skeleton'

export default function ProgressPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'overview'|'achievements'|'challenges'>('overview')
  const [loading, setLoading] = useState(true)
  const [earned, setEarned] = useState<Set<string>>(new Set())
  const [newAchievements, setNewAchievements] = useState<string[]>([])
  const [streak, setStreak] = useState({ current: 0, longest: 0, total: 0 })
  const [stats, setStats] = useState({ workouts: 0, meals: 0, prs: 0, volume: 0, daysLogged: 0 })
  const [profile, setProfile] = useState<any>(null)
  const [weights, setWeights] = useState<any[]>([])
  const [challenges, setChallenges] = useState<Record<string, number>>({})
  const [showNewAch, setShowNewAch] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }

    // Update streak first
    const streakData = await updateStreak(user.id)
    setStreak({ current: streakData.current, longest: streakData.longest, total: 0 })

    // Check achievements
    const newOnes = await checkAndAwardAchievements(user.id)
    if (newOnes.length > 0) { setNewAchievements(newOnes); setShowNewAch(true) }

    // Load everything
    const [
      { data: achData }, { data: streakFull }, { data: wlogs },
      { data: flogs }, { data: prs }, { data: prof }, { data: wts },
      { data: waterLogs }
    ] = await Promise.all([
      supabase.from('achievements').select('achievement_id').eq('user_id', user.id),
      supabase.from('streaks').select('*').eq('user_id', user.id).single(),
      supabase.from('workout_logs').select('total_volume_kg, started_at').eq('user_id', user.id),
      supabase.from('food_logs').select('logged_at, meal_type, cal, protein').eq('user_id', user.id),
      supabase.from('exercise_prs').select('id').eq('user_id', user.id),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('weight_logs').select('*').eq('user_id', user.id).order('logged_at'),
      supabase.from('water_logs').select('logged_at, amount_ml').eq('user_id', user.id)
    ])

    if (achData) setEarned(new Set(achData.map((a: any) => a.achievement_id)))
    if (streakFull) setStreak({ current: streakFull.current_streak, longest: streakFull.longest_streak, total: streakFull.total_days_logged })
    if (prof) setProfile(prof)
    if (wts) setWeights(wts)
    setChallenges(calculateWeeklyChallengeProgress({
      foodLogs: flogs || [],
      workoutLogs: wlogs || [],
      waterLogs: waterLogs || [],
      weightLogs: wts || [],
      calorieTarget: prof?.cal_target,
      proteinTarget: prof?.protein_target,
      waterTarget: prof?.water_goal,
    }))

    const uniqueDays = new Set((flogs || []).map((l: any) => l.logged_at))
    const totalVol = (wlogs || []).reduce((s: number, w: any) => s + (w.total_volume_kg || 0), 0)
    setStats({
      workouts: (wlogs || []).length,
      meals: (flogs || []).length,
      prs: (prs || []).length,
      volume: Math.round(totalVol),
      daysLogged: uniqueDays.size,
    })
    setLoading(false)
  }

  const earnedList = ACHIEVEMENTS.filter(a => earned.has(a.id))
  const notEarned = ACHIEVEMENTS.filter(a => !earned.has(a.id) && !a.secret)
  const pct = Math.round((earnedList.length / ACHIEVEMENTS.filter(a => !a.secret).length) * 100)

  const categories = ['nutrition', 'workout', 'weight', 'streak', 'supplement', 'milestone'] as const
  const catLabels = { nutrition:'🍽️ Nutrition', workout:'🏋️ Workout', weight:'⚖️ Weight', streak:'🔥 Streak', supplement:'💊 Supplement', milestone:'⭐ Milestone' }

  const weightChange = weights.length >= 2 ? weights[weights.length-1].weight_kg - weights[0].weight_kg : 0

  if (loading) return <PageLoader />

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 100 }}>

      {/* New achievement celebration */}
      {showNewAch && newAchievements.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--card)', borderRadius: 24, padding: 28, textAlign: 'center', maxWidth: 340, width: '100%', animation: 'pop 0.4s cubic-bezier(0.32,0.72,0,1)' }}>
            <div style={{ fontSize: 64, marginBottom: 8, animation: 'streakFire 1.5s ease infinite' }}>🏆</div>
            <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Achievement Unlocked!</div>
            {newAchievements.map(id => {
              const ach = ACHIEVEMENTS.find(a => a.id === id)
              if (!ach) return null
              const rc = RARITY_COLORS[ach.rarity]
              return (
                <div key={id} style={{ background: rc.bg, borderRadius: 16, padding: '16px', margin: '10px 0', border: `1.5px solid ${rc.border}` }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>{ach.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: rc.text, marginBottom: 2 }}>{ach.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ach.description}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: rc.text, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{ach.rarity}</div>
                </div>
              )
            })}
            <button onClick={() => setShowNewAch(false)}
              style={{ width: '100%', padding: '14px', background: 'var(--primary)', border: 'none', borderRadius: 14, color: 'var(--primary-contrast)', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 8 }}>
              Awesome! 🎉
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Progress</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>Streaks, achievements & challenges</p>
          </div>
        </div>

        {/* Streak hero card */}
        <div style={{ background: 'linear-gradient(135deg,var(--red),var(--red))', borderRadius: 24, padding: '20px', marginBottom: 16, color: 'var(--primary-contrast)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -10, top: -10, fontSize: 100, opacity: 0.1, lineHeight: 1 }}>🔥</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Current streak</div>
              <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, animation: streak.current > 0 ? 'streakFire 2s ease infinite' : 'none' }}>
                {streak.current}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>days 🔥</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { l: 'Best streak', v: streak.longest + 'd' },
                  { l: 'Total days', v: streak.total + 'd' },
                  { l: 'Workouts', v: String(stats.workouts) },
                  { l: 'Achievements', v: earnedList.length + '/' + ACHIEVEMENTS.filter(a => !a.secret).length },
                ].map(s => (
                  <div key={s.l} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{s.v}</div>
                    <div style={{ fontSize: 9, opacity: 0.75, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Streak calendar — last 14 days */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last 14 days</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: 14 }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - (13 - i))
                const ds = d.toISOString().slice(0, 10)
                const isToday = i === 13
                // We'd need food logs per day — simplified: show streak calc
                const inStreak = i >= 14 - streak.current
                return (
                  <div key={i} style={{ flex: 1, height: 24, borderRadius: 6, background: inStreak ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)', border: isToday ? '2px solid white' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {inStreak && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { icon: '🏋️', label: 'Workouts', val: stats.workouts, color: 'var(--primary)' },
            { icon: '🍽️', label: 'Meals logged', val: stats.meals, color: 'var(--green)' },
            { icon: '🏆', label: 'PRs set', val: stats.prs, color: 'var(--orange)' },
            { icon: '⚡', label: 'Volume (kg)', val: stats.volume >= 1000 ? Math.round(stats.volume/1000)+'k' : stats.volume, color: 'var(--red)' },
            { icon: '📅', label: 'Days logged', val: stats.daysLogged, color: 'var(--blue)' },
            { icon: weightChange < 0 ? '📉' : '📈', label: 'Weight change', val: (weightChange > 0 ? '+' : '') + weightChange.toFixed(1) + 'kg', color: weightChange < 0 ? 'var(--green)' : 'var(--red)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--card2)', borderRadius: 14, padding: 3, marginBottom: 16, border: '0.5px solid var(--border)' }}>
          {[['overview','Overview'],['achievements','Achievements'],['challenges','Challenges']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id as any)}
              style={{ flex: 1, padding: '9px', borderRadius: 11, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === id ? 'var(--primary)' : 'transparent', color: tab === id ? 'var(--primary-contrast)' : 'var(--muted)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            {/* Achievement progress */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Achievement progress</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>{pct}%</div>
              </div>
              <div style={{ height: 8, background: 'var(--card2)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--primary),var(--green))', width: pct + '%', borderRadius: 4, transition: 'width 1s ease' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                {earnedList.length} of {ACHIEVEMENTS.filter(a => !a.secret).length} achievements unlocked
              </div>
            </div>

            {/* Recent achievements */}
            {earnedList.length > 0 && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Recent achievements</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {earnedList.slice(-5).reverse().map(ach => {
                    const rc = RARITY_COLORS[ach.rarity]
                    return (
                      <div key={ach.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: rc.bg, borderRadius: 12, border: `1px solid ${rc.border}` }}>
                        <div style={{ fontSize: 24, flexShrink: 0 }}>{ach.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: rc.text }}>{ach.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.description}</div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: rc.text, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{ach.rarity}</div>
                      </div>
                    )
                  })}
                </div>
                <button onClick={() => setTab('achievements')} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
                  View all achievements →
                </button>
              </div>
            )}

            {/* Next achievable */}
            {notEarned.length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Next to unlock</div>
                {notEarned.slice(0, 3).map(ach => (
                  <div key={ach.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ fontSize: 24, opacity: 0.4, flexShrink: 0 }}>{ach.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--muted)' }}>{ach.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.description}</div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{ach.rarity}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ACHIEVEMENTS ── */}
        {tab === 'achievements' && (
          <div>
            {/* Rarity summary */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['common','rare','epic','legendary'] as const).map(r => {
                const rc = RARITY_COLORS[r]
                const total = ACHIEVEMENTS.filter(a => a.rarity === r && !a.secret).length
                const got = earnedList.filter(a => a.rarity === r).length
                return (
                  <div key={r} style={{ flex: 1, background: rc.bg, borderRadius: 12, padding: '10px 6px', textAlign: 'center', border: `1px solid ${rc.border}` }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: rc.text }}>{got}/{total}</div>
                    <div style={{ fontSize: 9, color: rc.text, fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r}</div>
                  </div>
                )
              })}
            </div>

            {/* Grouped by category */}
            {categories.map(cat => {
              const catAchs = ACHIEVEMENTS.filter(a => a.category === cat)
              const earnedCat = catAchs.filter(a => earned.has(a.id)).length
              return (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{catLabels[cat]}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{earnedCat}/{catAchs.filter(a => !a.secret).length}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catAchs.filter(a => !a.secret).map(ach => {
                      const isEarned = earned.has(ach.id)
                      const rc = RARITY_COLORS[ach.rarity]
                      return (
                        <div key={ach.id} style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '14px',
                          background: isEarned ? rc.bg : 'var(--card)',
                          borderRadius: 16, border: isEarned ? `1.5px solid ${rc.border}` : '0.5px solid var(--border)',
                          opacity: isEarned ? 1 : 0.55, transition: 'all 0.2s'
                        }}>
                          <div style={{ width: 48, height: 48, borderRadius: 14, background: isEarned ? `color-mix(in srgb, ${rc.border} 27%, transparent)` : 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                            {isEarned ? ach.icon : '🔒'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: isEarned ? rc.text : 'var(--muted)' }}>{ach.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{ach.description}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: isEarned ? rc.text : 'var(--muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {rc.badge}
                            </div>
                          </div>
                          {isEarned && (
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: 'checkPop 0.3s ease' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary-contrast)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {/* Secret achievements hint */}
                    {cat === 'milestone' && (
                      <div style={{ padding: '12px 14px', background: 'var(--card2)', borderRadius: 12, border: '0.5px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>🎭</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Some achievements are secret — discover them by exploring</div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── CHALLENGES ── */}
        {tab === 'challenges' && (
          <div>
            {/* Week header */}
            <div style={{ background: 'linear-gradient(135deg,var(--primary),var(--primary-dark))', borderRadius: 20, padding: '16px 20px', marginBottom: 16, color: 'var(--primary-contrast)' }}>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Weekly challenges
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} — {
                  new Date(Date.now() + (6 - new Date().getDay()) * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })
                }
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                Complete challenges to earn bonus XP
              </div>
            </div>

            {WEEKLY_CHALLENGES.map(ch => {
              const progress = challenges[ch.id] || 0
              const completed = progress >= ch.target
              const pct = Math.min(100, Math.round((progress / ch.target) * 100))
              return (
                <div key={ch.id} className="card" style={{ marginBottom: 12, opacity: completed ? 0.8 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: `color-mix(in srgb, ${ch.color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                      {completed ? '✅' : ch.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{ch.title}</div>
                        {completed && <div style={{ padding: '2px 8px', background: 'var(--green-bg)', borderRadius: 99, fontSize: 10, fontWeight: 700, color: 'var(--green)' }}>Done!</div>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ch.description}</div>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: ch.color }}>{progress}/{ch.target}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>days</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'var(--card2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: completed ? 'var(--green)' : ch.color, borderRadius: 3, width: pct + '%', transition: 'width 0.8s ease' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>
                    {completed ? 'Completed! 🎉' : `${ch.target - progress} days to go`}
                  </div>
                </div>
              )
            })}

            <div style={{ background: 'var(--card2)', borderRadius: 16, padding: '14px 16px', border: '0.5px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>🔄</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                Challenges reset every Monday. Progress is tracked automatically as you use the app.
              </div>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
