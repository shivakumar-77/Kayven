// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { PageLoader } from '@/components/Skeleton'
import { MuscleIcon, ClipboardIcon, ChartBarIcon, HeartBeatIcon, BoltIcon } from '@/lib/icons'

export default function WorkoutPage() {
const router = useRouter()
const [profile, setProfile] = useState(null)
const [templates, setTemplates] = useState([])
const [recentLogs, setRecentLogs] = useState([])
const [stats, setStats] = useState({ total:0, volume:0, week:0 })
const [loading, setLoading] = useState(true)
const [activeWorkout, setActiveWorkout] = useState(null)

useEffect(() => { load() }, [])

async function load() {
const { data:{ user } } = await supabase.auth.getUser()
if (!user) { router.replace('/auth'); return }
const [{ data:prof }, { data:tmpl }, { data:logs }] = await Promise.all([
      supabase.from('profiles').select('name,photo_url').eq('id', user.id).single(),
      supabase.from('workout_templates').select('*').eq('user_id', user.id).order('created_at',{ascending:false}),
      supabase.from('workout_logs').select('*').eq('user_id', user.id).order('started_at',{ascending:false}).limit(20),
    ])
if (prof) setProfile(prof)
if (tmpl) setTemplates(tmpl)
if (logs) {
setRecentLogs(logs.slice(0,5))
const week = new Date(); week.setDate(week.getDate()-7)
setStats({
total: logs.length,
week: logs.filter(l=>new Date(l.started_at)>week).length,
volume: Math.round(logs.reduce((s,l)=>s+(l.total_volume_kg||0),0))
      })
    }
const active = localStorage.getItem('Kayven_active_workout')
if (active) { try { setActiveWorkout(JSON.parse(active)) } catch {} }
setLoading(false)
  }

function fmtDate(d) {
return new Date(d).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})
  }
function fmtDur(s) {
if (!s) return ''
const m=Math.floor(s/60), h=Math.floor(m/60)
return h>0?`${h}h ${m%60}m`:`${m}m`
  }

if (loading) return <PageLoader/>

return (
<div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:100}}>
<style jsx>{`
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .fade-in-up { animation: fadeInUp 0.45s cubic-bezier(.4,0,.2,1) both; }
`}</style>
<div style={{padding:'calc(env(safe-area-inset-top,0px) + 20px) 20px 0'}}>

{/* Header */}
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22}} className="fade-in-up">
<div>
<p style={{fontSize:13,color:'var(--muted)',fontWeight:600}}>Hey, {profile?.name?.split(' ')[0]||'there'}</p>
<h1 style={{fontSize:30,fontWeight:800,letterSpacing:'-0.03em',marginTop:3,color:'var(--text)'}}>Start Workout</h1>
</div>
<button onClick={()=>router.push('/profile')} className="press-effect" style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
<div style={{width:46,height:46,borderRadius:'50%',overflow:'hidden',background:'linear-gradient(135deg,var(--primary),var(--primary-light))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'var(--primary-contrast)',border:'2px solid var(--border)'}}>
{profile?.photo_url?<img src={profile.photo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:(profile?.name?.[0]?.toUpperCase()||'?')}
</div>
</button>
</div>

{/* Active workout banner */}
{activeWorkout && (
<button onClick={()=>router.push('/workout/active')}
className="press-effect pulse-ring fade-in-up"
style={{width:'100%',background:'linear-gradient(135deg,var(--green),color-mix(in srgb, var(--green) 75%, black))',borderRadius:20,padding:'16px 18px',border:'none',cursor:'pointer',textAlign:'left',marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,'--pulse-color':'color-mix(in srgb, var(--green) 35%, transparent)'}}>
<div style={{minWidth:0}}>
<div style={{fontSize:11,color:'rgba(255,255,255,0.8)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Active workout</div>
<div style={{fontSize:16,fontWeight:700,color:'var(--primary-contrast)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{activeWorkout.name}</div>
<div style={{fontSize:12,color:'rgba(255,255,255,0.85)',fontWeight:500,marginTop:2}}>Tap to resume →</div>
</div>
<div style={{width:44,height:44,borderRadius:'50%',background:'rgba(255,255,255,0.22)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
<svg width="18" height="18" viewBox="0 0 24 24" fill="var(--primary-contrast)"><path d="M8 5v14l11-7z"/></svg>
</div>
</button>
        )}

{/* Quick start — the fastest path to logging */}
<div className="fade-in-up" style={{marginBottom:20}}>
<button onClick={()=>router.push('/workout/active?quick=1')} className="press-effect"
style={{width:'100%',background:'var(--primary)',borderRadius:20,padding:'18px 20px',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:14,WebkitTapHighlightColor:'transparent',boxShadow:'0 8px 20px -8px var(--primary)'}}>
<div style={{width:44,height:44,borderRadius:14,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary-contrast)"><path d="M8 5v14l11-7z"/></svg>
</div>
<div style={{textAlign:'left'}}>
<div style={{fontSize:16,fontWeight:700,color:'var(--primary-contrast)'}}>Start an empty workout</div>
<div style={{fontSize:12,color:'rgba(255,255,255,0.8)',fontWeight:500,marginTop:1}}>No template needed</div>
</div>
</button>
</div>

{/* Volume summary — surfaces stats already computed above (total/week/volume), not previously shown */}
<div className="fade-in-up" style={{display:'flex',gap:8,marginBottom:24}}>
{[
            {label:'Total',val:stats.total,Icon:MuscleIcon,color:'var(--primary)'},
            {label:'This week',val:stats.week,Icon:ChartBarIcon,color:'var(--green)'},
            {label:'Volume (kg)',val:stats.volume,Icon:BoltIcon,color:'var(--orange)'},
          ].map(s=>(
<div key={s.label} style={{flex:1,background:'var(--card)',border:'1.5px solid var(--border)',borderRadius:16,padding:'12px 10px',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
<s.Icon size={16} color={s.color}/>
<div style={{fontSize:17,fontWeight:800,color:'var(--text)'}}>{s.val}</div>
<div style={{fontSize:10,color:'var(--muted)',fontWeight:600,textAlign:'center'}}>{s.label}</div>
</div>
          ))}
</div>

{/* 2x2 grid */}
<div className="fade-in-up" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:28}}>
{[
            {label:'Exercises',Icon:MuscleIcon,sub:'Browse all',action:()=>router.push('/workout/exercises')},
            {label:'Create Templates',Icon:ClipboardIcon,sub:'Build routines',action:()=>router.push('/workout/template')},
            {label:'History',Icon:ChartBarIcon,sub:`${stats.total} workouts`,action:()=>router.push('/workout/history')},
            {label:'Body Anatomy',Icon:HeartBeatIcon,sub:'Muscle map',action:()=>router.push('/workout/body')},
          ].map(item=>(
<button key={item.label} onClick={item.action} className="press-effect"
style={{background:'var(--card)',borderRadius:20,padding:'18px 16px',border:'1.5px solid var(--border)',cursor:'pointer',textAlign:'left',position:'relative',WebkitTapHighlightColor:'transparent',minHeight:110,display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
<div style={{width:34,height:34,borderRadius:10,background:'var(--primary-bg)',display:'flex',alignItems:'center',justifyContent:'center'}}>
<item.Icon size={19} color='var(--primary)' />
</div>
<div>
<div style={{fontWeight:700,fontSize:15,color:'var(--text)',marginBottom:2}}>{item.label}</div>
<div style={{fontSize:11,color:'var(--muted)'}}>{item.sub}</div>
</div>
</button>
          ))}
</div>

{/* Templates section */}
<div className="fade-in-up" style={{marginBottom:28}}>
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
<h2 style={{fontSize:20,fontWeight:700,color:'var(--text)'}}>Templates</h2>
<button onClick={()=>router.push('/workout/template')} className="press-effect"
style={{background:'var(--primary-bg)',border:'1.5px solid var(--primary)',borderRadius:99,padding:'5px 14px',fontSize:12,fontWeight:700,color:'var(--primary)',cursor:'pointer'}}>
                + Template
</button>
</div>

{templates.length===0?(
<div style={{background:'var(--card)',borderRadius:20,border:'2px dashed var(--border)',padding:'30px 20px',textAlign:'center'}}>
<div style={{width:44,height:44,borderRadius:12,background:'var(--primary-bg)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
<ClipboardIcon size={22} color='var(--primary)'/>
</div>
<div style={{fontWeight:700,fontSize:14,marginBottom:4,color:'var(--text)'}}>No templates yet</div>
<div style={{fontSize:12,color:'var(--muted)',marginBottom:16}}>Create reusable workout routines</div>
<button onClick={()=>router.push('/workout/template')} className="press-effect" style={{background:'var(--primary)',border:'none',borderRadius:12,padding:'10px 22px',color:'var(--primary-contrast)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                Create template
</button>
</div>
          ):(
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
{templates.map(t=>(
<div key={t.id} style={{background:'var(--card)',borderRadius:20,padding:'16px',border:'1.5px solid var(--border)',minHeight:128,display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
<div>
<div style={{width:30,height:30,borderRadius:9,background:'var(--primary-bg)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
<ClipboardIcon size={16} color='var(--primary)'/>
</div>
<div style={{fontWeight:700,fontSize:15,color:'var(--text)',marginBottom:3,lineHeight:1.2}}>{t.name}</div>
<div style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>{(t.exercises||[]).length} exercises</div>
</div>
<div style={{display:'flex',gap:6,marginTop:12}}>
<button onClick={()=>router.push('/workout/active?template='+t.id)} className="press-effect"
style={{flex:1,background:'var(--primary)',border:'none',borderRadius:10,padding:'8px',color:'var(--primary-contrast)',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--primary-contrast)"><path d="M8 5v14l11-7z"/></svg>
                      Start
</button>
<button onClick={()=>router.push('/workout/template?edit='+t.id)} className="press-effect"
style={{background:'var(--card2)',border:'1.5px solid var(--border)',borderRadius:10,padding:'8px 10px',color:'var(--muted)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
</button>
</div>
</div>
              ))}
</div>
          )}
</div>

{/* Recent history */}
{recentLogs.length>0&&(
<div className="fade-in-up">
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
<h2 style={{fontSize:20,fontWeight:700,color:'var(--text)'}}>Recent</h2>
<button onClick={()=>router.push('/workout/history')} style={{background:'none',border:'none',color:'var(--primary)',fontSize:13,fontWeight:600,cursor:'pointer'}}>See all</button>
</div>
<div style={{display:'flex',flexDirection:'column',gap:8}}>
{recentLogs.map(log=>(
<div key={log.id} style={{background:'var(--card)',borderRadius:16,padding:'14px 16px',border:'1.5px solid var(--border)'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
<div style={{fontWeight:700,fontSize:14,color:'var(--text)'}}>{log.name}</div>
<div style={{fontSize:11,color:'var(--muted)',fontWeight:500}}>{fmtDate(log.started_at)}</div>
</div>
<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
{log.duration_seconds&&(
<div style={{display:'flex',alignItems:'center',gap:4,background:'var(--surface)',borderRadius:8,padding:'3px 8px',fontSize:11,color:'var(--muted)',fontWeight:600}}>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
{fmtDur(log.duration_seconds)}
</div>
              )}
{log.total_volume_kg&&(
<div style={{display:'flex',alignItems:'center',gap:4,background:'var(--surface)',borderRadius:8,padding:'3px 8px',fontSize:11,color:'var(--muted)',fontWeight:600}}>
<BoltIcon size={11} color='var(--muted)'/>
{log.total_volume_kg}kg
</div>
              )}
<div style={{display:'flex',alignItems:'center',gap:4,background:'var(--surface)',borderRadius:8,padding:'3px 8px',fontSize:11,color:'var(--muted)',fontWeight:600}}>
<MuscleIcon size={11} color='var(--muted)'/>
{(log.exercises||[]).length} exercises
</div>
</div>
</div>
              ))}
</div>
</div>
        )}
</div>
<BottomNav/>
</div>
  )
}
