'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { EXERCISES, CATEGORIES } from '@/lib/exercises'
import BottomNav from '@/components/BottomNav'

const IconX = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
)
const IconPlus = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)
const IconPencil = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
)
const IconTrash = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
)
const IconClipboard = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 10h6M9 14h6" /></svg>
)
const IconPlay = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
)

export default function TemplatePage() {
  const router = useRouter()
  const [templates, setTemplates] = useState([])
  const [view, setView] = useState('list') // list | create | edit
  const [editTemplate, setEditTemplate] = useState(null)
  const [tName, setTName] = useState('')
  const [tExercises, setTExercises] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [filterCat, setFilterCat] = useState('All')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data:{ user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('workout_templates').select('*').eq('user_id', user.id).order('created_at',{ascending:false})
    if (data) setTemplates(data)
  }

  function startCreate() {
    setTName(''); setTExercises([]); setEditTemplate(null); setView('create')
  }

  function startEdit(t) {
    setTName(t.name); setTExercises(t.exercises||[]); setEditTemplate(t); setView('create')
  }

  async function save() {
    if (!tName.trim()) return
    setSaving(true)
    const { data:{ user } } = await supabase.auth.getUser()
    const payload = { user_id:user.id, name:tName, exercises:tExercises }
    if (editTemplate) await supabase.from('workout_templates').update(payload).eq('id', editTemplate.id)
    else await supabase.from('workout_templates').insert(payload)
    setSaving(false); load(); setView('list')
  }

  async function deleteTemplate(id) {
    if (!confirm('Delete this template?')) return
    await supabase.from('workout_templates').delete().eq('id', id)
    load()
  }

  function addExercise(ex) {
    setTExercises(p=>[...p,{...ex,sets:ex.sets||3,reps:ex.reps||8}])
    setShowPicker(false)
  }

  const filtered = EXERCISES.filter(e=>
    (filterCat==='All'||e.category===filterCat)&&
    (!searchQ||e.name.toLowerCase().includes(searchQ.toLowerCase()))
  )

  if (view==='list') return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', maxWidth:430, margin:'0 auto', paddingBottom:100 }}>
      <style jsx>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
        .fade-in-up { animation: fadeInUp 0.4s cubic-bezier(.4,0,.2,1) both; }
      `}</style>
      <div style={{ padding:'calc(env(safe-area-inset-top,0px) + 12px) 20px 0' }}>
        <div className="fade-in-up" style={{ display:'flex', alignItems:'center', gap:12, marginBottom:22 }}>
          <button onClick={()=>router.back()} className="press-effect" style={{ width:38, height:38, borderRadius:11, background:'var(--card)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.02em', flex:1, color:'var(--text)' }}>Templates</h1>
          <button onClick={startCreate} className="press-effect" style={{ background:'var(--primary)', border:'none', borderRadius:12, padding:'9px 16px', color:'var(--primary-contrast)', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            <IconPlus size={12}/> New
          </button>
        </div>

        {templates.length===0?(
          <div className="card fade-in-up" style={{ textAlign:'center', padding:'44px 24px' }}>
            <div style={{ width:56, height:56, borderRadius:16, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'var(--primary)' }}>
              <IconClipboard size={26}/>
            </div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:6, color:'var(--text)' }}>No templates yet</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:22 }}>Create reusable workout templates</div>
            <button className="btn btn-primary" style={{ width:'auto', padding:'12px 26px' }} onClick={startCreate}>Create first template</button>
          </div>
        ):(
          templates.map((t,ti)=>(
            <div key={t.id} className="card fade-in-up" style={{ marginBottom:12, animationDelay:`${Math.min(ti,6)*0.05}s` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontWeight:700, fontSize:16, color:'var(--text)' }}>{t.name}</div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>startEdit(t)} className="press-effect" style={{ background:'var(--card2)', border:'1.5px solid var(--border)', borderRadius:9, padding:'6px 11px', fontSize:12, fontWeight:600, cursor:'pointer', color:'var(--text)', display:'flex', alignItems:'center', gap:5 }}>
                    <IconPencil size={11}/> Edit
                  </button>
                  <button onClick={()=>deleteTemplate(t.id)} className="press-effect" style={{ background:'var(--red-bg)', border:'1.5px solid color-mix(in srgb, var(--red) 35%, transparent)', borderRadius:9, padding:'6px 11px', fontSize:12, fontWeight:600, cursor:'pointer', color:'var(--red)', display:'flex', alignItems:'center', gap:5 }}>
                    <IconTrash size={11}/> Delete
                  </button>
                </div>
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', fontWeight:500, marginBottom:12 }}>{(t.exercises||[]).length} exercises</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
                {(t.exercises||[]).map((e,i)=>(
                  <div key={i} style={{ padding:'4px 10px', background:'var(--primary-bg)', borderRadius:99, fontSize:11, fontWeight:600, color:'var(--primary)' }}>{e.name}</div>
                ))}
              </div>
              <button onClick={()=>router.push('/workout/active?template='+t.id)} className="press-effect"
                style={{ width:'100%', padding:'12px', borderRadius:13, background:'var(--primary)', border:'none', color:'var(--primary-contrast)', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, boxShadow:'0 6px 16px -6px var(--primary)' }}>
                <IconPlay size={11}/> Start workout
              </button>
            </div>
          ))
        )}
      </div>
      <BottomNav/>
    </div>
  )

  return (
    <div style={{ background:'var(--surface)', minHeight:'100dvh', maxWidth:430, margin:'0 auto', paddingBottom:100 }}>
      <style jsx>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
        @keyframes tSheetUp { from { transform:translateY(100%);} to { transform:translateY(0);} }
        .fade-in-up { animation: fadeInUp 0.4s cubic-bezier(.4,0,.2,1) both; }
        .t-sheet-up { animation: tSheetUp 0.3s cubic-bezier(.4,0,.2,1); }
      `}</style>
      <div style={{ padding:'calc(env(safe-area-inset-top,0px) + 12px) 20px 0' }}>
        <div className="fade-in-up" style={{ display:'flex', alignItems:'center', gap:12, marginBottom:22 }}>
          <button onClick={()=>setView('list')} className="press-effect" style={{ width:38, height:38, borderRadius:11, background:'var(--card)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.02em', flex:1, color:'var(--text)' }}>{editTemplate?'Edit':'New'} Template</h1>
          <button onClick={save} disabled={saving||!tName.trim()} className="press-effect" style={{ background:'var(--primary)', border:'none', borderRadius:12, padding:'9px 16px', color:'var(--primary-contrast)', fontWeight:700, fontSize:13, cursor:'pointer', opacity:!tName.trim()?0.5:1 }}>
            {saving?'Saving…':'Save'}
          </button>
        </div>

        <input value={tName} onChange={e=>setTName(e.target.value)} placeholder="Template name e.g. Push Day A"
          style={{ fontSize:19, fontWeight:800, background:'transparent', border:'none', borderBottom:'2px solid var(--border)', padding:'0 0 10px', width:'100%', outline:'none', color:'var(--text)', letterSpacing:'-0.02em', marginBottom:22 }}/>

        {tExercises.map((ex,i)=>(
          <div key={i} className="card fade-in-up" style={{ marginBottom:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, animationDelay:`${Math.min(i,6)*0.04}s` }}>
            <div style={{ width:42, height:42, borderRadius:12, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{ex.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--text)' }}>{ex.name}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{ex.sets} sets × {ex.reps} reps</div>
            </div>
            <button onClick={()=>setTExercises(p=>p.filter((_,j)=>j!==i))} className="press-effect"
              style={{ background:'var(--red-bg)', border:'none', borderRadius:9, width:30, height:30, cursor:'pointer', color:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <IconX size={13}/>
            </button>
          </div>
        ))}

        <button onClick={()=>setShowPicker(true)} className="press-effect fade-in-up"
          style={{ width:'100%', padding:'15px', borderRadius:17, background:'var(--primary-bg)', border:'2px dashed var(--primary)', cursor:'pointer', fontSize:14, fontWeight:700, color:'var(--primary)', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
          <IconPlus size={13}/> Add Exercise
        </button>
      </div>

      {showPicker&&(
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'flex-end' }}>
          <div className="t-sheet-up" style={{ background:'var(--surface)', width:'100%', maxWidth:430, margin:'0 auto', borderRadius:'26px 26px 0 0', maxHeight:'80dvh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontWeight:800, fontSize:18, color:'var(--text)' }}>Add Exercise</div>
              <button onClick={()=>setShowPicker(false)} className="press-effect" style={{ background:'var(--card2)', border:'none', borderRadius:10, width:32, height:32, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
                <IconX size={14}/>
              </button>
            </div>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
              <input type="text" placeholder="Search…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ marginBottom:10 }}/>
              <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
                {CATEGORIES.map(c=>(
                  <button key={c} onClick={()=>setFilterCat(c)} className="press-effect"
                    style={{ padding:'6px 13px', borderRadius:99, fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0, border:'1.5px solid '+(filterCat===c?'var(--primary)':'var(--border)'), background:filterCat===c?'var(--primary)':'transparent', color:filterCat===c?'var(--primary-contrast)':'var(--muted)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {filtered.map(ex=>(
                <button key={ex.id} onClick={()=>addExercise(ex)} className="press-effect"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'13px 20px', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{ex.emoji}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:'var(--text)' }}>{ex.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{ex.category} · {ex.muscle}</div>
                  </div>
                  <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--primary-bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--primary)', flexShrink:0 }}>
                    <IconPlus size={13}/>
                  </div>
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
