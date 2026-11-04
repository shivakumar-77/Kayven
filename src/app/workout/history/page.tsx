// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { PageLoader } from '@/components/Skeleton'

function fmt(s: number) {
  if (!s) return '—'
  const m = Math.floor(s/60), h = Math.floor(m/60)
  return h > 0 ? `${h}h ${m%60}m` : `${m}m`
}

export default function WorkoutHistoryPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<any[]>([])
  const [prs, setPRs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [chartData, setChartData] = useState<[string,number][]>([])
  const [tab, setTab] = useState<'history'|'prs'>('history')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: wlogs }, { data: prData }] = await Promise.all([
      supabase.from('workout_logs').select('*').eq('user_id', user.id).order('started_at', { ascending: false }).limit(50),
      supabase.from('exercise_prs').select('*').eq('user_id', user.id).order('achieved_at', { ascending: false })
    ])
    if (wlogs) {
      setLogs(wlogs)
      const weeks: Record<string, number> = {}
      wlogs.forEach(l => {
        const d = new Date(l.started_at)
        d.setDate(d.getDate() - d.getDay())
        const k = d.toISOString().slice(0,10)
        weeks[k] = (weeks[k] || 0) + (l.total_volume_kg || 0)
      })
      setChartData(Object.entries(weeks).sort((a,b) => a[0].localeCompare(b[0])).slice(-8))
    }
    if (prData) setPRs(prData)
    setLoading(false)
  }

  async function deleteLog(id: string) {
    if (!confirm('Delete this workout?')) return
    await supabase.from('workout_logs').delete().eq('id', id)
    setLogs(p => p.filter(l => l.id !== id))
  }

  const grouped = logs.reduce((acc: Record<string, any[]>, l) => {
    const k = new Date(l.started_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    if (!acc[k]) acc[k] = []
    acc[k].push(l); return acc
  }, {})

  const maxVol = Math.max(...chartData.map(([,v]) => v), 1)

  if (loading) return <PageLoader />

  return (
    <div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', paddingBottom: 100 }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 12px) 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--card)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>History</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{logs.length} workouts</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--card2)', borderRadius: 14, padding: 3, marginBottom: 16, border: '0.5px solid var(--border)' }}>
          {[['history','📊 History'],['prs','🏆 PRs']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id as any)}
              style={{ flex: 1, padding: '9px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === id ? 'var(--primary)' : 'transparent', color: tab === id ? 'var(--primary-contrast)' : 'var(--muted)' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'history' && (
          <>
            {/* Volume chart */}
            {chartData.length > 1 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Weekly volume</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Total kg lifted per week</div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 80 }}>
                  {chartData.map(([week,vol], i) => {
                    const h = Math.max(6, (vol/maxVol)*68)
                    const isLatest = i === chartData.length - 1
                    return (
                      <div key={week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 8, color: 'var(--primary)', fontWeight: 700 }}>
                          {vol >= 1000 ? Math.round(vol/1000)+'k' : Math.round(vol)}
                        </div>
                        <div style={{ width: '100%', height: h, background: isLatest ? 'var(--primary)' : 'var(--primary)', borderRadius: 5, opacity: isLatest ? 1 : 0.4, transition: 'height 0.5s' }} />
                        <div style={{ fontSize: 8, color: 'var(--muted)' }}>
                          {new Date(week+'T12:00:00').toLocaleDateString('en-IN',{month:'short',day:'numeric'})}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Grouped logs */}
            {Object.entries(grouped).map(([month, monthLogs]) => (
              <div key={month} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{month}</div>
                {monthLogs.map(log => (
                  <div key={log.id} className="card" style={{ marginBottom: 10 }}>
                    <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{log.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {new Date(log.started_at).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>⏱️ {fmt(log.duration_seconds)}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>⚡ {log.total_volume_kg||0}kg</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>💪 {(log.exercises||[]).length} ex</span>
                      </div>
                    </button>

                    {expanded === log.id && (
                      <div style={{ borderTop: '0.5px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                          {(log.exercises || []).map((ex: any, i: number) => {
                            const done = (ex.sets || []).filter((s: any) => s.done)
                            const best = done.reduce((b: any, s: any) => (!b || (parseFloat(s.weight)||0) > (parseFloat(b.weight)||0) ? s : b), null)
                            return (
                              <div key={i} style={{ background: 'var(--card2)', borderRadius: 10, padding: '10px' }}>
                                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{done.length} sets</div>
                                {best && <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>Best: {best.weight}×{best.reps}</div>}
                              </div>
                            )
                          })}
                        </div>
                        <button onClick={() => deleteLog(log.id)}
                          style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 10, padding: '8px 14px', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Delete workout
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {logs.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No workouts yet</div>
                <button className="btn btn-primary" style={{ width: 'auto', padding: '12px 24px', marginTop: 12 }} onClick={() => router.push('/workout')}>Start first workout</button>
              </div>
            )}
          </>
        )}

        {tab === 'prs' && (
          <div>
            {prs.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No PRs yet</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Complete sets to start tracking personal records</div>
              </div>
            ) : (
              <div>
                <div style={{ background: 'linear-gradient(135deg,var(--orange),var(--orange))', borderRadius: 20, padding: '16px 20px', marginBottom: 16, color: 'var(--primary-contrast)' }}>
                  <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>Total PRs achieved</div>
                  <div style={{ fontSize: 36, fontWeight: 800 }}>{prs.length}</div>
                </div>
                {prs.map(pr => (
                  <div key={pr.id} className="card" style={{ marginBottom: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{pr.exercise_name}</div>
                      <div style={{ padding: '3px 10px', background: 'var(--orange-bg)', borderRadius: 99, fontSize: 11, fontWeight: 700, color: 'var(--orange)' }}>🏆 PR</div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Best set</div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--primary)' }}>{pr.weight_kg}kg × {pr.reps}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Est. 1RM</div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--green)' }}>{pr.one_rm_estimate}kg</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Achieved</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                          {new Date(pr.achieved_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
