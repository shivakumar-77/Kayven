// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

export default function SupplementHistoryPage() {
  const router = useRouter()
  const [supplements, setSupplements] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [calMonth, setCalMonth] = useState(new Date())

  useEffect(()=>{ load() }, [calMonth])

  async function load() {
    const { data:{ user } } = await supabase.auth.getUser()
    const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).toISOString().slice(0,10)
    const lastDay  = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).toISOString().slice(0,10)
    const [{ data:supps }, { data:monthLogs }] = await Promise.all([
      supabase.from('supplements').select('*').eq('user_id', user.id),
      supabase.from('supplement_logs').select('*').eq('user_id', user.id).gte('logged_at', firstDay).lte('logged_at', lastDay).order('taken_at', {ascending:false})
    ])
    if (supps) setSupplements(supps)
    if (monthLogs) setLogs(monthLogs)
    setLoading(false)
  }

  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 0).getDate()
  const firstWd = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay()
  const today = new Date().toISOString().slice(0,10)

  function dayLogs(dateStr) { return logs.filter(l=>l.logged_at===dateStr) }
  function dayPct(dateStr) {
    const taken = new Set(dayLogs(dateStr).map(l=>l.supplement_id)).size
    return supplements.length>0?Math.round((taken/supplements.length)*100):0
  }
  function dayColor(pct) {
    if (pct===0) return 'var(--card2)'
    if (pct<50) return 'var(--orange-bg)'
    if (pct<100) return 'var(--green-bg)'
    return 'var(--green)'
  }

  // Group logs by date
  const grouped = logs.reduce((acc,l)=>{
    if (!acc[l.logged_at]) acc[l.logged_at]=[]
    acc[l.logged_at].push(l)
    return acc
  },{})

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100dvh'}}><div style={{width:32,height:32,borderRadius:'50%',border:'3px solid var(--primary)',borderTopColor:'transparent',animation:'spin 0.7s linear infinite'}}/></div>

  return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:100}}>
      <div style={{padding:'calc(env(safe-area-inset-top,0px) + 12px) 20px 0'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
          <button onClick={()=>router.back()} style={{width:36,height:36,borderRadius:10,background:'var(--card)',border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{fontSize:22,fontWeight:700,flex:1}}>Supplement History</h1>
        </div>

        {/* Calendar */}
        <div className="card" style={{marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <button onClick={()=>setCalMonth(new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1))}
              style={{width:36,height:36,borderRadius:10,background:'var(--card2)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div style={{fontWeight:700,fontSize:16}}>{calMonth.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</div>
            <button onClick={()=>setCalMonth(new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1))}
              style={{width:36,height:36,borderRadius:10,background:'var(--card2)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:8}}>
            {['S','M','T','W','T','F','S'].map((d,i)=>(
              <div key={i} style={{textAlign:'center',fontSize:11,fontWeight:700,color:'var(--muted)',padding:'4px 0'}}>{d}</div>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
            {Array.from({length:firstWd}).map((_,i)=><div key={'e'+i}/>)}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const day = i+1
              const ds = `${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const pct = dayPct(ds)
              const isToday = ds===today
              const isFuture = new Date(ds)>new Date()
              return (
                <div key={day}
                  style={{aspectRatio:'1',borderRadius:8,background:dayColor(pct),border:isToday?'2px solid var(--primary)':'2px solid transparent',opacity:isFuture?0.3:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1}}>
                  <span style={{fontSize:10,fontWeight:isToday?700:400,color:pct===100?'var(--colored-label)':'var(--text)'}}>{day}</span>
                  {pct>0&&<div style={{width:4,height:4,borderRadius:'50%',background:pct===100?'var(--colored-label)':'var(--green)',opacity:0.8}}/>}
                </div>
              )
            })}
          </div>

          <div style={{display:'flex',gap:12,marginTop:12,flexWrap:'wrap'}}>
            {[{c:'var(--green)',l:'100% done'},{c:'var(--green-bg)',l:'Partial'},{c:'var(--orange-bg)',l:'< 50%'},{c:'var(--card2)',l:'None'}].map(x=>(
              <div key={x.l} style={{display:'flex',alignItems:'center',gap:4}}>
                <div style={{width:10,height:10,borderRadius:3,background:x.c,border:'1px solid var(--border)'}}/>
                <span style={{fontSize:10,color:'var(--muted)'}}>{x.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Log history */}
        <div style={{fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Log history</div>
        {Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,dayLog])=>(
          <div key={date} style={{marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:8}}>
              {new Date(date+'T12:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}
              <span style={{fontSize:11,fontWeight:500,color:'var(--muted)',marginLeft:8}}>
                {new Set(dayLog.map(l=>l.supplement_id)).size}/{supplements.length} taken
              </span>
            </div>
            <div style={{background:'var(--card)',borderRadius:16,border:'1.5px solid var(--border)',overflow:'hidden'}}>
              {dayLog.map((log,i)=>{
                const supp = supplements.find(s=>s.id===log.supplement_id)
                return (
                  <div key={log.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',borderBottom:i<dayLog.length-1?'0.5px solid var(--border)':'none'}}>
                    <div style={{width:32,height:32,borderRadius:10,background:`color-mix(in srgb, ${getSupplementColor(supp || {})} 14%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                      {supp?.icon||'PillIcon'}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13}}>{supp?.name||'Unknown'}</div>
                      <div style={{fontSize:11,color:'var(--muted)'}}>{log.dose_amount} {log.dose_unit}</div>
                    </div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>
                      {new Date(log.taken_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {logs.length===0&&(
          <div style={{textAlign:'center',padding:'40px',color:'var(--muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>📅</div>
            <div style={{fontSize:14,fontWeight:600}}>No logs this month</div>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  )
}
