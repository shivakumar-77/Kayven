'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { PageLoader } from '@/components/Skeleton'

const CATEGORY_COLORS: Record<string, string> = {
  'Performance': 'var(--primary)',
  'Recovery': 'var(--green)',
  'Health': 'var(--blue)',
  'Weight': 'var(--orange)',
  'Vitamins': 'var(--orange)',
  'Minerals': 'var(--primary)',
  'Hormones': 'var(--red)',
  'General': 'var(--primary)',
}

function getSupplementColor(supplement: { color?: string; category?: string }) {
  return CATEGORY_COLORS[supplement.category || ''] || 'var(--primary)'
}

const POPULAR_SUPPLEMENTS = [
  { name:'Creatine Monohydrate', category:'Performance', icon:'BoltIcon', color:'var(--primary)', dose_amount:5, dose_unit:'g', goal:'Increase muscle strength and power output', notes:'Take with water or juice. Best taken consistently daily.' },
  { name:'Whey Protein', category:'Recovery', icon:'GlassIcon', color:'var(--green)', dose_amount:30, dose_unit:'g', goal:'Support muscle recovery and protein synthesis', notes:'Best consumed within 30 minutes post-workout.' },
  { name:'Vitamin D3', category:'Vitamins', icon:'SunIcon', color:'var(--orange)', dose_amount:2000, dose_unit:'IU', goal:'Support immune system and bone health', notes:'Take with a fat-containing meal for best absorption.' },
  { name:'Omega-3 Fish Oil', category:'Health', icon:'FishIcon', color:'var(--blue)', dose_amount:2, dose_unit:'capsule', goal:'Reduce inflammation and support heart health', notes:'Take with meals to reduce fishy aftertaste.' },
  { name:'Magnesium', category:'Minerals', icon:'BatteryIcon', color:'var(--primary)', dose_amount:400, dose_unit:'mg', goal:'Improve sleep quality and muscle recovery', notes:'Best taken 30-60 minutes before bed.' },
  { name:'Pre-Workout', category:'Performance', icon:'FireIcon', color:'var(--red)', dose_amount:1, dose_unit:'scoop', goal:'Increase energy and workout performance', notes:'Take 20-30 minutes before training.' },
  { name:'BCAA', category:'Recovery', icon:'MuscleIcon', color:'var(--green)', dose_amount:10, dose_unit:'g', goal:'Reduce muscle breakdown during training', notes:'Can be taken before, during or after workout.' },
  { name:'Ashwagandha', category:'Health', icon:'LeafIcon', color:'var(--green)', dose_amount:600, dose_unit:'mg', goal:'Reduce cortisol and stress levels', notes:'Take with meals. Effects build over 4-8 weeks.' },
  { name:'Zinc', category:'Minerals', icon:'NutBoltIcon', color:'var(--primary)', dose_amount:15, dose_unit:'mg', goal:'Support testosterone and immune function', notes:'Take on empty stomach or with light meal.' },
  { name:'Caffeine', category:'Performance', icon:'CoffeeIcon', color:'var(--orange)', dose_amount:200, dose_unit:'mg', goal:'Enhance focus and athletic performance', notes:'Avoid after 2pm to prevent sleep disruption.' },
  { name:'Collagen', category:'Recovery', icon:'BoneIcon', color:'var(--primary)', dose_amount:15, dose_unit:'g', goal:'Support joint health and skin elasticity', notes:'Take with vitamin C for better absorption.' },
  { name:'Melatonin', category:'Health', icon:'MoonIcon', color:'var(--primary)', dose_amount:3, dose_unit:'mg', goal:'Improve sleep quality and circadian rhythm', notes:'Take 30-60 minutes before sleep.' },
]

function today() { return new Date().toISOString().slice(0,10) }
function fmtTime(date) {
  return new Date(date).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
}

export default function SupplementsPage() {
  const router = useRouter()
  const [supplements, setSupplements] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('today') // today | all | add
  const [showAdd, setShowAdd] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [loggingId, setLoggingId] = useState(null)
  const [msg, setMsg] = useState('')
  const [msgError, setMsgError] = useState(false)
  const [weekStreak, setWeekStreak] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }

    const [{ data:supps }, { data:todayLogs }, { data:weekLogs }] = await Promise.all([
      supabase.from('supplements').select('*').eq('user_id', user.id).eq('active', true).order('created_at'),
      supabase.from('supplement_logs').select('*').eq('user_id', user.id).eq('logged_at', today()),
      supabase.from('supplement_logs').select('supplement_id,logged_at').eq('user_id', user.id)
        .gte('logged_at', new Date(Date.now()-6*86400000).toISOString().slice(0,10))
    ])
    if (supps) setSupplements(supps)
    if (todayLogs) setLogs(todayLogs)

    // Build streak data per supplement
    const streakMap = {}
    if (weekLogs) {
      weekLogs.forEach(l => {
        if (!streakMap[l.supplement_id]) streakMap[l.supplement_id] = new Set()
        streakMap[l.supplement_id].add(l.logged_at)
      })
    }
    setWeekStreak(streakMap)
    setLoading(false)
  }

  function isTakenToday(suppId) {
    return logs.some(l => l.supplement_id === suppId)
  }

  function todayCount() {
    return supplements.filter(s => isTakenToday(s.id)).length
  }

  async function logDose(supp) {
    setLoggingId(supp.id)
    try {
      const { data:{ user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) { router.replace('/auth'); return }
      const { data: log, error } = await supabase.from('supplement_logs').insert({
        user_id: user.id,
        supplement_id: supp.id,
        logged_at: today(),
        dose_amount: supp.dose_amount,
        dose_unit: supp.dose_unit,
        taken_at: new Date().toISOString()
      }).select().single()
      if (error) throw error
      setLogs(previous => [...previous, log])

      if (supp.stock_count > 0) {
        const stockCount = Math.max(0, supp.stock_count - supp.dose_amount)
        const { error: stockError } = await supabase.from('supplements')
          .update({ stock_count: stockCount }).eq('id', supp.id)
        if (stockError) {
          console.error('[Supplements] Dose saved, but stock update failed', stockError)
          showMsg(`${supp.name} logged, but stock could not be updated.`, true)
          return
        }
        setSupplements(previous => previous.map(item =>
          item.id === supp.id ? { ...item, stock_count: stockCount } : item
        ))
      }
      showMsg('✓ ' + supp.name + ' logged!')
    } catch (error) {
      console.error('[Supplements] Failed to log dose', error)
      showMsg('Could not log this dose. Please try again.', true)
    } finally {
      setLoggingId(null)
    }
  }

  async function undoLog(suppId) {
    const log = logs.find(l => l.supplement_id === suppId)
    if (!log) return
    await supabase.from('supplement_logs').delete().eq('id', log.id)
    showMsg('Removed from today')
    load()
  }

  async function quickAddSupplement(template) {
    try {
      const { data:{ user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) { router.replace('/auth'); return }
      const { error } = await supabase.from('supplements').insert({
        user_id: user.id, ...template, times_per_day: 1, frequency: 'daily', stock_count: 0
      })
      if (error) throw error
      setShowQuickAdd(false)
      showMsg(template.name + ' added!')
      load()
    } catch (error) {
      console.error('[Supplements] Failed to add supplement', error)
      showMsg('Could not add this supplement. Please try again.', true)
    }
  }

  async function deleteSupp(id) {
    await supabase.from('supplements').update({ active: false }).eq('id', id)
    load()
  }

  function showMsg(m, isError = false) {
    setMsgError(isError)
    setMsg(m)
    setTimeout(()=>setMsg(''), 2500)
  }

  const pct = supplements.length > 0 ? Math.round((todayCount()/supplements.length)*100) : 0
  const weekDays = Array.from({length:7},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(6-i))
    return d.toISOString().slice(0,10)
  })

  if (loading) return <PageLoader/>

  return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:100}}>
      <div style={{padding:'calc(env(safe-area-inset-top,0px) + 20px) 20px 0'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:800,letterSpacing:'-0.03em'}}>Supplements</h1>
            <p style={{fontSize:13,color:'var(--muted)',marginTop:2}}>
              {todayCount()} of {supplements.length} taken today
            </p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setShowQuickAdd(true)}
              style={{background:'var(--primary)',border:'none',borderRadius:12,padding:'9px 16px',color:'var(--primary-contrast)',fontSize:13,fontWeight:700,cursor:'pointer'}}>
              + Add
            </button>
          </div>
        </div>

        {msg&&<div role={msgError?'alert':'status'} aria-live={msgError?'assertive':'polite'} style={{background:msgError?'var(--red-bg)':'var(--green-bg)',border:'1.5px solid var(--border)',borderRadius:12,padding:'10px 16px',marginBottom:16,fontSize:13,fontWeight:600,color:msgError?'var(--red)':'var(--green)'}}>{msg}</div>}

        {/* Daily progress ring */}
        {supplements.length > 0 && (
          <div style={{background:'linear-gradient(135deg,var(--primary),var(--primary-dark))',borderRadius:24,padding:'20px',marginBottom:20,color:'var(--primary-contrast)'}}>
            <div style={{display:'flex',alignItems:'center',gap:20}}>
              {/* Ring */}
              <div style={{position:'relative',flexShrink:0}}>
                <svg width="90" height="90" viewBox="0 0 90 90">
                  <circle cx="45" cy="45" r="38" fill="none" stroke="color-mix(in srgb, var(--primary-contrast) 20%, transparent)" strokeWidth="7"/>
                  <circle cx="45" cy="45" r="38" fill="none" stroke="var(--primary-contrast)" strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={String(2*Math.PI*38)}
                    strokeDashoffset={String(2*Math.PI*38*(1-pct/100))}
                    style={{transformOrigin:'45px 45px',transform:'rotate(-90deg)',transition:'stroke-dashoffset 1s ease'}}/>
                  <text x="45" y="41" textAnchor="middle" fontSize="18" fontWeight="900" fill="var(--primary-contrast)">{pct}%</text>
                  <text x="45" y="55" textAnchor="middle" fontSize="9" fill="var(--primary-contrast)" opacity="0.75">complete</text>
                </svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>
                  {pct===100?'🎉 All done!':pct>=50?'💪 Good progress!':'🌱 Keep going!'}
                </div>
                <div style={{fontSize:13,opacity:0.85,lineHeight:1.5}}>
                  {todayCount()} of {supplements.length} supplements taken
                </div>
                {/* Week streak dots */}
                <div style={{display:'flex',gap:6,marginTop:10,alignItems:'center'}}>
                  <div style={{fontSize:10,opacity:0.7,marginRight:2}}>This week</div>
                  {weekDays.map(day=>{
                    const anyLogged = supplements.some(s => weekStreak[s.id]?.has(day))
                    const isToday = day===today()
                    return (
                      <div key={day} style={{width:22,height:22,borderRadius:6,background:anyLogged?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.2)',border:isToday?'2px solid white':'2px solid transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {anyLogged&&<div style={{width:8,height:8,borderRadius:'50%',background:'var(--primary)'}}/>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Today's supplements */}
        {supplements.length===0 ? (
          <div style={{background:'var(--card)',borderRadius:24,border:'2px dashed var(--border)',padding:'40px 24px',textAlign:'center',marginBottom:20}}>
            <div style={{fontSize:52,marginBottom:12}}>💊</div>
            <div style={{fontWeight:800,fontSize:18,marginBottom:6}}>Start your stack</div>
            <div style={{fontSize:13,color:'var(--muted)',marginBottom:20,lineHeight:1.7}}>
              Add your supplements and track your daily intake. Build consistent habits.
            </div>
            <button onClick={()=>setShowQuickAdd(true)}
              style={{background:'var(--primary)',border:'none',borderRadius:14,padding:'13px 28px',color:'var(--primary-contrast)',fontWeight:700,fontSize:15,cursor:'pointer'}}>
              Add first supplement
            </button>
          </div>
        ) : (
          <div>
            <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Today</div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
              {supplements.map(supp=>{
                const color = getSupplementColor(supp)
                const taken = isTakenToday(supp.id)
                const log = logs.find(l=>l.supplement_id===supp.id)
                const weekDone = weekStreak[supp.id]?.size||0
                const stockLow = supp.stock_count>0 && supp.stock_count<=supp.dose_amount*7

                return (
                  <div key={supp.id}
                    style={{background:'var(--card)',borderRadius:20,border:'1.5px solid '+(taken?color:'var(--border)'),padding:'16px',transition:'all 0.2s',opacity:taken?0.95:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:14}}>
                      {/* Icon circle */}
                      <div style={{width:52,height:52,borderRadius:16,background:taken?color:`color-mix(in srgb, ${color} 14%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0,transition:'background 0.2s'}}>
                        {taken?<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-contrast)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:supp.icon||'PillIcon'}
                      </div>

                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:15,color:'var(--text)',marginBottom:2}}>{supp.name}</div>
                        <div style={{fontSize:12,color:'var(--muted)',marginBottom:4}}>
                          {supp.dose_amount} {supp.dose_unit} · {supp.category}
                        </div>
                        {/* Week progress dots */}
                        <div style={{display:'flex',gap:4}}>
                          {weekDays.map(day=>{
                            const done = weekStreak[supp.id]?.has(day)
                            const isT = day===today()
                            return <div key={day} style={{width:14,height:14,borderRadius:4,background:done?color:'var(--card2)',border:isT?'1.5px solid '+color:'1.5px solid transparent',opacity:done?1:0.4}}/>
                          })}
                          <div style={{fontSize:10,color:'var(--muted)',marginLeft:4,alignSelf:'center'}}>{weekDone}/7</div>
                        </div>
                      </div>

                      {/* Action button */}
                      <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0,alignItems:'flex-end'}}>
                        <button
                          onClick={()=>taken?undoLog(supp.id):logDose(supp)}
                          disabled={loggingId===supp.id}
                          style={{padding:'9px 16px',borderRadius:12,background:taken?'var(--card2)':color,border:taken?'1.5px solid var(--border)':'none',color:taken?'var(--muted)':'var(--primary-contrast)',fontWeight:700,fontSize:13,cursor:'pointer',transition:'all 0.2s',minWidth:70,textAlign:'center'}}>
                          {loggingId===supp.id?'…':taken?'Undo':'Take'}
                        </button>
                        {taken&&log&&<div style={{fontSize:10,color:'var(--muted)'}}>{fmtTime(log.taken_at)}</div>}
                        {stockLow&&!taken&&<div style={{fontSize:10,color:'var(--red)',fontWeight:600}}>⚠️ Low stock</div>}
                      </div>
                    </div>

                    {/* Goal / notes */}
                    {(supp.goal||supp.notes)&&(
                      <div style={{marginTop:12,padding:'10px 12px',background:'var(--card2)',borderRadius:10,fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
                        {supp.goal||supp.notes}
                      </div>
                    )}

                    {/* Stock indicator */}
                    {supp.stock_count>0&&(
                      <div style={{marginTop:10,display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1,height:4,background:'var(--card2)',borderRadius:2,overflow:'hidden'}}>
                          <div style={{height:'100%',background:stockLow?'var(--red)':color,borderRadius:2,width:Math.min(100,Math.round((supp.stock_count/(supp.dose_amount*30))*100))+'%'}}/>
                        </div>
                        <div style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>
                          {Math.round(supp.stock_count)}{supp.stock_unit} left
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Log history for today */}
        {logs.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Today's log</div>
            <div style={{background:'var(--card)',borderRadius:16,border:'1.5px solid var(--border)',overflow:'hidden'}}>
              {logs.map((log,i)=>{
                const supp = supplements.find(s=>s.id===log.supplement_id)
                return (
                  <div key={log.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderBottom:i<logs.length-1?'0.5px solid var(--border)':'none'}}>
                    <div style={{width:32,height:32,borderRadius:10,background:`color-mix(in srgb, ${getSupplementColor(supp || {})} 14%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                      {supp?.icon||'PillIcon'}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13}}>{supp?.name||'Unknown'}</div>
                      <div style={{fontSize:11,color:'var(--muted)'}}>{log.dose_amount} {log.dose_unit}</div>
                    </div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{fmtTime(log.taken_at)}</div>
                    <div style={{width:20,height:20,borderRadius:'50%',background:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--colored-label)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Quick add modal — choose from popular or custom */}
      {showQuickAdd&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:200,display:'flex',alignItems:'flex-end'}}>
          <div style={{background:'var(--surface)',width:'100%',maxWidth:430,margin:'0 auto',borderRadius:'24px 24px 0 0',maxHeight:'88dvh',display:'flex',flexDirection:'column',paddingBottom:'calc(env(safe-area-inset-bottom,0px) + 16px)'}}>
            <div style={{padding:'16px 20px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)',flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:18}}>Add Supplement</div>
              <button onClick={()=>setShowQuickAdd(false)} style={{background:'var(--card2)',border:'none',borderRadius:8,width:30,height:30,cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--muted)'}}>✕</button>
            </div>

            <div style={{padding:'10px 16px',flexShrink:0}}>
              <button onClick={()=>{setShowQuickAdd(false);router.push('/supplements/add')}}
                style={{width:'100%',padding:'13px',background:'var(--primary)',border:'none',borderRadius:14,color:'var(--primary-contrast)',fontWeight:700,fontSize:14,cursor:'pointer',marginBottom:12}}>
                + Create custom supplement
              </button>
              <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Popular supplements</div>
            </div>

            <div style={{overflowY:'auto',flex:1}}>
              {POPULAR_SUPPLEMENTS.map(s=>(
                <button key={s.name} onClick={()=>quickAddSupplement(s)}
                  style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'14px 20px',background:'none',border:'none',borderBottom:'0.5px solid var(--border)',cursor:'pointer',textAlign:'left',WebkitTapHighlightColor:'transparent', transition:'transform 0.15s ease, box-shadow 0.15s ease'}}>
                  <div style={{width:46,height:46,borderRadius:14,background:`color-mix(in srgb, ${getSupplementColor(s)} 14%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
                    {s.icon}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:'var(--text)'}}>{s.name}</div>
                    <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{s.dose_amount} {s.dose_unit} · {s.category}</div>
                    <div style={{fontSize:11,color:s.color,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.goal}</div>
                  </div>
                  <div style={{color:'var(--primary)',fontSize:20,flexShrink:0}}>+</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <BottomNav/>
    </div>
  )
}
