'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { PageLoader } from '@/components/Skeleton'
import UpgradePrompt from '@/components/UpgradePrompt'
import { useEntitlement } from '@/lib/billing/client'
import { fetchMeteredAI } from '@/lib/client/metered-ai-fetch'

export default function InsightsPage() {
  const router = useRouter()
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [weekData, setWeekData] = useState([])
  const [profile, setProfile] = useState(null)
  const [todayLogs, setTodayLogs] = useState([])
  const [allLogs, setAllLogs] = useState([])
  const { enabled: hasAdvancedProgress, loading: entitlementLoading } = useEntitlement('advanced_progress')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    const { data:prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (prof) setProfile(prof)

    const days = []
    for (let i=6;i>=0;i--) { const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10)) }

    const { data:logs } = await supabase.from('food_logs').select('*').eq('user_id', user.id)
      .gte('logged_at', days[0]).order('logged_at',{ascending:false})

    const today = new Date().toISOString().slice(0,10)
    setTodayLogs((logs||[]).filter(l=>l.logged_at===today))
    setAllLogs(logs||[])

    const grouped = days.map(date => {
      const dl = (logs||[]).filter(l=>l.logged_at===date)
      return {
        date, shortDate: new Date(date+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short'}),
        cal: dl.reduce((s,l)=>s+l.cal,0),
        protein: dl.reduce((s,l)=>s+l.protein,0),
        carb: dl.reduce((s,l)=>s+l.carb,0),
        fat: dl.reduce((s,l)=>s+l.fat,0),
        logged: dl.length>0, count: dl.length
      }
    })
    setWeekData(grouped)
    if (prof && grouped.some(d=>d.logged)) generateInsights(grouped, prof, logs||[])
  }

  async function generateInsights(weeklyLogs, prof, logs) {
    if (!entitlementLoading && !hasAdvancedProgress) {
      setInsights({ locked: true, message: 'Advanced progress insights are available with KAYVEN Premium.' })
      return
    }
    setLoading(true)
    try {
      const res = await fetchMeteredAI('/api/insights', {
          weeklyLogs,
          targets:{ cal:prof.cal_target, protein:prof.protein_target, carb:prof.carb_target, fat:prof.fat_target },
          profile:prof
      })
      const data = await res.json()
      if (data.error === 'FEATURE_NOT_AVAILABLE') {
        setInsights({ locked: true, message: data.message })
        return
      }
      if (data.result) setInsights(data.result)
    } catch {} finally { setLoading(false) }
  }

  const target = profile?.cal_target || 1700
  const maxCal = Math.max(...weekData.map(d=>d.cal), target)
  const avgCal = weekData.filter(d=>d.logged).length
    ? Math.round(weekData.filter(d=>d.logged).reduce((s,d)=>s+d.cal,0)/weekData.filter(d=>d.logged).length)
    : 0
  const avgProtein = weekData.filter(d=>d.logged).length
    ? Math.round(weekData.filter(d=>d.logged).reduce((s,d)=>s+d.protein,0)/weekData.filter(d=>d.logged).length)
    : 0
  const daysLogged = weekData.filter(d=>d.logged).length
  const consistency = Math.round((daysLogged/7)*100)

  // Today macros
  const todayTotals = todayLogs.reduce((a,l)=>({cal:a.cal+l.cal,protein:a.protein+l.protein,carb:a.carb+l.carb,fat:a.fat+l.fat}),{cal:0,protein:0,carb:0,fat:0})
  const remainingCal = Math.max(0, target - todayTotals.cal)

  return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:100}}>

      {/* Header */}
      <div style={{padding:'calc(env(safe-area-inset-top,0px) + 20px) 20px 0'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <h1 style={{fontSize:24,fontWeight:700,letterSpacing:'-0.02em'}}>Nutrition Insights</h1>
          <button onClick={()=>router.push('/meal-plan')}
            style={{background:'var(--primary)',border:'none',borderRadius:12,padding:'8px 14px',color:'var(--primary-contrast)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
            Meal Plan →
          </button>
        </div>
        <p style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>Your weekly AI-powered analysis</p>

        {/* Today snapshot */}
        <div style={{background:'linear-gradient(135deg,var(--primary),var(--primary-dark))',borderRadius:20,padding:'18px 20px',marginBottom:16,color:'var(--primary-contrast)'}}>
          <div style={{fontSize:12,opacity:0.85,marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Today</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <div style={{fontSize:36,fontWeight:800}}>{Math.round(todayTotals.cal)}</div>
              <div style={{fontSize:12,opacity:0.75}}>of {target} kcal</div>
            </div>
            <div style={{width:64,height:64,position:'relative'}}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="6"/>
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--primary-contrast)" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={String(2*Math.PI*28)}
                  strokeDashoffset={String(2*Math.PI*28*(1-Math.min(1,todayTotals.cal/target)))}
                  style={{transformOrigin:'32px 32px',transform:'rotate(-90deg)'}}/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'var(--primary-contrast)'}}>
                {Math.round(Math.min(100,todayTotals.cal/target*100))}%
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:16}}>
            {[{l:'Protein',v:Math.round(todayTotals.protein),u:'g',t:profile?.protein_target||167},{l:'Carbs',v:Math.round(todayTotals.carb),u:'g',t:profile?.carb_target||144},{l:'Fat',v:Math.round(todayTotals.fat),u:'g',t:profile?.fat_target||60},{l:'Remaining',v:remainingCal,u:'kcal',t:null}].map(m=>(
              <div key={m.l} style={{textAlign:'center'}}>
                <div style={{fontSize:15,fontWeight:800}}>{m.v}</div>
                <div style={{fontSize:9,opacity:0.7}}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Week bar chart */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
            <div style={{fontWeight:700,fontSize:15}}>This week</div>
            <div style={{display:'flex',gap:16}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:14,fontWeight:800,color:'var(--primary)'}}>{daysLogged}/7</div>
                <div style={{fontSize:9,color:'var(--muted)',fontWeight:600}}>DAYS</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:14,fontWeight:800,color:'var(--primary)'}}>{consistency}%</div>
                <div style={{fontSize:9,color:'var(--muted)',fontWeight:600}}>STREAK</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:14,fontWeight:800,color:'var(--primary)'}}>{avgCal}</div>
                <div style={{fontSize:9,color:'var(--muted)',fontWeight:600}}>AVG KCAL</div>
              </div>
            </div>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:14}}>Daily calories vs {target} kcal goal</div>

          {/* Bars */}
          <div style={{display:'flex',gap:6,alignItems:'flex-end',height:100,marginBottom:8}}>
            {weekData.map((d,i)=>{
              const h = d.cal>0?Math.max(6,(d.cal/maxCal)*84):4
              const over = d.cal>target*1.1
              const under = d.logged && d.cal<target*0.7
              const color = !d.logged?'var(--border)':over?'var(--red)':under?'var(--orange)':'var(--green)'
              const isToday = d.date===new Date().toISOString().slice(0,10)
              return (
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  {d.cal>0&&<div style={{fontSize:8,color,fontWeight:700}}>
                    {d.cal>=1000?(d.cal/1000).toFixed(1)+'k':Math.round(d.cal)}
                  </div>}
                  <div style={{width:'100%',height:h,background:color,borderRadius:6,transition:'height 0.6s ease',opacity:isToday?1:0.75}}/>
                  <div style={{fontSize:10,color:isToday?'var(--primary)':'var(--muted)',fontWeight:isToday?700:500}}>{d.shortDate}</div>
                </div>
              )
            })}
          </div>

          {/* Macro breakdown bars */}
          <div style={{display:'flex',gap:8,marginTop:10}}>
            {[{l:'Protein',avg:avgProtein,target:profile?.protein_target||167,c:'var(--protein)'},{l:'Avg cal',avg:avgCal,target,c:'var(--primary)'}].map(m=>(
              <div key={m.l} style={{flex:1}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:10,color:'var(--muted)',fontWeight:600}}>{m.l}</span>
                  <span style={{fontSize:10,fontWeight:700,color:m.c}}>{m.avg}/{m.target}</span>
                </div>
                <div style={{height:6,background:'var(--card2)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',background:m.c,borderRadius:3,width:Math.min(100,Math.round(m.avg/m.target*100))+'%',transition:'width 0.8s'}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Macro split this week */}
        {daysLogged>0&&(
          <div className="card" style={{marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>Macro split — 7 day avg</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
              {[
                {l:'Calories',avg:avgCal,target:profile?.cal_target||1700,u:'kcal',c:'var(--primary)',bg:'var(--primary-bg)'},
                {l:'Protein',avg:avgProtein,target:profile?.protein_target||167,u:'g',c:'var(--protein)',bg:'var(--blue-bg)'},
                {l:'Carbs',avg:Math.round(weekData.filter(d=>d.logged).reduce((s,d)=>s+d.carb,0)/Math.max(1,daysLogged)),target:profile?.carb_target||144,u:'g',c:'var(--carbs)',bg:'var(--orange-bg)'},
                {l:'Fat',avg:Math.round(weekData.filter(d=>d.logged).reduce((s,d)=>s+d.fat,0)/Math.max(1,daysLogged)),target:profile?.fat_target||60,u:'g',c:'var(--fat)',bg:'var(--card2)'},
              ].map(m=>{
                const pct=Math.min(100,Math.round(m.avg/m.target*100))
                return (
                  <div key={m.l} style={{background:m.bg,borderRadius:14,padding:'12px 8px',textAlign:'center'}}>
                    <div style={{fontSize:16,fontWeight:800,color:m.c}}>{m.avg}</div>
                    <div style={{fontSize:9,color:m.c,opacity:0.8,marginTop:1}}>{m.u}</div>
                    <div style={{margin:'8px 0 4px',height:4,background:'rgba(0,0,0,0.08)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',background:m.c,borderRadius:2,width:pct+'%'}}/>
                    </div>
                    <div style={{fontSize:9,fontWeight:700,color:m.c}}>{pct}%</div>
                    <div style={{fontSize:8,color:'var(--muted)',marginTop:1}}>{m.l}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* AI Insights */}
        {loading&&(
          <div className="card" style={{marginBottom:16,textAlign:'center',padding:'32px'}}>
            <div style={{width:36,height:36,borderRadius:'50%',border:'3px solid var(--primary)',borderTopColor:'transparent',animation:'spin 0.7s linear infinite',margin:'0 auto 12px'}}/>
            <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>AI is analysing your week…</div>
            <div style={{fontSize:12,color:'var(--muted)'}}>Crunching 7 days of nutrition data</div>
          </div>
        )}

        {insights&&!loading&&(
          <>
            {insights.locked ? <UpgradePrompt context="feature_locked" suggestedPlan="standard" title="Advanced progress insights" message={insights.message || 'Advanced progress insights are available on the Standard plan.'} /> : <>
            {/* Score card */}
            <div style={{background:'var(--green)',borderRadius:20,padding:'20px',marginBottom:16,color:'var(--colored-label)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{fontSize:12,opacity:0.8,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Weekly score</div>
                  <div style={{fontSize:48,fontWeight:900,lineHeight:1}}>{insights.score}</div>
                  <div style={{fontSize:12,opacity:0.75,marginTop:4}}>out of 100</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:40,marginBottom:4}}>{insights.score>=80?'TrophyIcon':insights.score>=60?'MuscleIcon':insights.score>=40?'ChartUpIcon':'SproutIcon'}</div>
                  <div style={{fontSize:13,fontWeight:700,opacity:0.9}}>{insights.score>=80?'Elite':insights.score>=60?'Good':insights.score>=40?'Building':'Starting'}</div>
                </div>
              </div>
              <div style={{background:'rgba(255,255,255,0.2)',borderRadius:12,padding:'12px 14px',marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:600,lineHeight:1.6}}>{insights.headline}</div>
              </div>
              <div style={{display:'flex',gap:0}}>
                {[{l:'Avg cal',v:Math.round(insights.calories_avg||avgCal)},{l:'Avg protein',v:(Math.round(insights.protein_avg||avgProtein))+'g'},{l:'Consistency',v:(insights.consistency||consistency)+'%'}].map((s,i,arr)=>(
                  <div key={s.l} style={{flex:1,textAlign:'center',paddingRight:i<arr.length-1?'0':0,borderRight:i<arr.length-1?'1px solid rgba(255,255,255,0.2)':'none'}}>
                    <div style={{fontSize:18,fontWeight:800}}>{s.v}</div>
                    <div style={{fontSize:9,opacity:0.7,marginTop:2,textTransform:'uppercase',letterSpacing:'0.04em'}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Insight cards */}
            {insights.insights?.map((ins,i)=>(
              <div key={i} className="card" style={{marginBottom:12}}>
                <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{width:46,height:46,borderRadius:14,background:'var(--primary-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
                    {ins.icon}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>{ins.title}</div>
                    <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.7}}>{ins.body}</div>
                  </div>
                </div>
              </div>
            ))}

            <button className="btn btn-ghost" style={{width:'100%',padding:'14px',fontWeight:700,marginBottom:16}}
              onClick={()=>generateInsights(weekData,profile,allLogs)}>
              🔄 Refresh analysis
            </button>
            </>}
          </>
        )}

        {!loading&&!insights&&weekData.some(d=>d.logged)&&(
          <button className="btn btn-primary" style={{width:'100%',padding:'15px',fontWeight:700,fontSize:15,marginBottom:16}}
            onClick={()=>generateInsights(weekData,profile,allLogs)}>
            ✨ Generate AI insights
          </button>
        )}

        {!loading&&!insights&&!weekData.some(d=>d.logged)&&(
          <div className="card" style={{textAlign:'center',padding:'32px',marginBottom:16}}>
            <div style={{fontSize:40,marginBottom:12}}>📊</div>
            <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>No data yet</div>
            <div style={{fontSize:13,color:'var(--muted)',marginBottom:16}}>Start logging meals to get AI-powered insights</div>
            <button className="btn btn-primary" style={{width:'auto',padding:'12px 24px',fontWeight:700}} onClick={()=>router.push('/log')}>
              Log your first meal
            </button>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  )
}
