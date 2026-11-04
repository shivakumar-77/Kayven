'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ICONS = ['PillIcon','BottleIcon','SyringeIcon','LeafIcon','BoltIcon','FireIcon','SunIcon','MoonIcon','MuscleIcon','FishIcon','GlassIcon','🍵','CoffeeIcon','BeakerIcon','BatteryIcon','BoneIcon','SproutIcon','NutBoltIcon','HeartIcon','DNAIcon']
const COLORS = ['var(--primary)','var(--blue)','var(--green)','var(--orange)','var(--red)','var(--primary-light)','var(--blue)','var(--carbs)','var(--fat)','var(--orange)']
const CATEGORIES = ['Performance','Recovery','Health','Weight','Vitamins','Minerals','Hormones','General']
const UNITS = ['capsule','tablet','scoop','g','mg','ml','IU','softgel','gummy','drop']
const FREQUENCIES = [
  { key:'daily', label:'Every day' },
  { key:'weekdays', label:'Weekdays only' },
  { key:'workout', label:'Workout days' },
  { key:'weekly', label:'Once a week' },
]

export default function AddSupplementForm() {
  const router = useRouter()
  const params = useSearchParams()
  const editId = params.get('edit')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:'', category:'General', icon:'PillIcon', color:'var(--primary)',
    dose_amount:'1', dose_unit:'capsule', times_per_day:1,
    frequency:'daily', stock_count:'', stock_unit:'capsule',
    goal:'', notes:''
  })

  useEffect(() => {
    if (editId) loadExisting()
  }, [editId])

  async function loadExisting() {
    const { data } = await supabase.from('supplements').select('*').eq('id', editId).single()
    if (data) setForm({
      name:data.name||'', category:data.category||'General',
      icon:data.icon||'PillIcon', color:data.color||'var(--primary)',
      dose_amount:String(data.dose_amount||1), dose_unit:data.dose_unit||'capsule',
      times_per_day:data.times_per_day||1, frequency:data.frequency||'daily',
      stock_count:String(data.stock_count||''), stock_unit:data.stock_unit||'capsule',
      goal:data.goal||'', notes:data.notes||''
    })
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const { data:{ user } } = await supabase.auth.getUser()
    const payload = {
      name: form.name, category: form.category, icon: form.icon, color: form.color,
      dose_amount: parseFloat(form.dose_amount)||1, dose_unit: form.dose_unit,
      times_per_day: form.times_per_day, frequency: form.frequency,
      stock_count: parseFloat(form.stock_count)||0, stock_unit: form.stock_unit,
      goal: form.goal, notes: form.notes, active: true
    }
    if (editId) await supabase.from('supplements').update(payload).eq('id', editId)
    else await supabase.from('supplements').insert({ user_id: user.id, ...payload })
    setSaving(false)
    router.back()
  }

  const L = ({text}) => <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>{text}</div>

  return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:40}}>
      <div style={{position:'sticky',top:0,zIndex:100,background:'var(--surface)',padding:'calc(env(safe-area-inset-top,0px) + 12px) 20px 12px',borderBottom:'1px solid var(--border)',backdropFilter:'blur(12px)',display:'flex',alignItems:'center',gap:12}}>
        <button onClick={()=>router.back()} style={{width:36,height:36,borderRadius:10,background:'var(--card)',border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{flex:1,fontWeight:700,fontSize:18}}>{editId?'Edit':'Add'} Supplement</div>
        <button onClick={save} disabled={saving||!form.name.trim()}
          style={{background:'var(--primary)',border:'none',borderRadius:12,padding:'8px 18px',color:'var(--primary-contrast)',fontWeight:700,fontSize:14,cursor:'pointer',opacity:!form.name.trim()?0.5:1}}>
          {saving?'Saving…':'Save'}
        </button>
      </div>

      <div style={{padding:'20px'}}>
        {/* Preview card */}
        <div style={{background:`color-mix(in srgb, ${form.color} 10%, transparent)`,borderRadius:20,padding:'16px',border:'1.5px solid '+`color-mix(in srgb, ${form.color} 28%, transparent)`,marginBottom:20,display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:56,height:56,borderRadius:16,background:form.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>{form.icon}</div>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:form.color}}>{form.name||'Supplement name'}</div>
            <div style={{fontSize:13,color:'var(--muted)',marginTop:2}}>{form.dose_amount} {form.dose_unit} · {form.category}</div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:1}}>{FREQUENCIES.find(f=>f.key===form.frequency)?.label}</div>
          </div>
        </div>

        {/* Name */}
        <div style={{marginBottom:16}}>
          <L text="Supplement name"/>
          <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Creatine Monohydrate"/>
        </div>

        {/* Category */}
        <div style={{marginBottom:16}}>
          <L text="Category"/>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>setForm(p=>({...p,category:c}))}
                style={{padding:'7px 14px',borderRadius:99,fontSize:12,fontWeight:600,cursor:'pointer',border:'1.5px solid '+(form.category===c?'var(--primary)':'var(--border)'),background:form.category===c?'var(--primary-bg)':'var(--card)',color:form.category===c?'var(--primary)':'var(--muted)',WebkitTapHighlightColor:'transparent'}}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Icon picker */}
        <div style={{marginBottom:16}}>
          <L text="Icon"/>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {ICONS.map(icon=>(
              <button key={icon} onClick={()=>setForm(p=>({...p,icon}))}
                style={{width:42,height:42,borderRadius:12,border:'2px solid '+(form.icon===icon?'var(--primary)':'var(--border)'),background:form.icon===icon?'var(--primary-bg)':'var(--card)',cursor:'pointer',fontSize:22,display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div style={{marginBottom:16}}>
          <L text="Color"/>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {COLORS.map(c=>(
              <button key={c} onClick={()=>setForm(p=>({...p,color:c}))}
                style={{width:36,height:36,borderRadius:10,background:c,border:form.color===c?'3px solid var(--text)':'3px solid transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
                {form.color===c&&<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary-contrast)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            ))}
          </div>
        </div>

        {/* Dose */}
        <div style={{marginBottom:16}}>
          <L text="Dose per serving"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <input type="text" inputMode="decimal" placeholder="e.g. 5" value={form.dose_amount}
              onChange={e=>setForm(p=>({...p,dose_amount:e.target.value}))}/>
            <select value={form.dose_unit} onChange={e=>setForm(p=>({...p,dose_unit:e.target.value}))}>
              {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Frequency */}
        <div style={{marginBottom:16}}>
          <L text="How often"/>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {FREQUENCIES.map(f=>(
              <button key={f.key} onClick={()=>setForm(p=>({...p,frequency:f.key}))}
                style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 16px',borderRadius:14,border:'1.5px solid '+(form.frequency===f.key?'var(--primary)':'var(--border)'),background:form.frequency===f.key?'var(--primary-bg)':'var(--card)',cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                <span style={{fontWeight:600,fontSize:14,color:form.frequency===f.key?'var(--primary)':'var(--text)'}}>{f.label}</span>
                {form.frequency===f.key&&<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            ))}
          </div>
        </div>

        {/* Stock */}
        <div style={{marginBottom:16}}>
          <L text="Current stock (optional)"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <input type="text" inputMode="decimal" placeholder="e.g. 60" value={form.stock_count}
              onChange={e=>setForm(p=>({...p,stock_count:e.target.value}))}/>
            <select value={form.stock_unit} onChange={e=>setForm(p=>({...p,stock_unit:e.target.value}))}>
              {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>Track how many you have left — get a low stock warning</div>
        </div>

        {/* Goal */}
        <div style={{marginBottom:16}}>
          <L text="Your goal with this supplement"/>
          <input value={form.goal} onChange={e=>setForm(p=>({...p,goal:e.target.value}))} placeholder="e.g. Improve muscle strength and recovery"/>
        </div>

        {/* Notes */}
        <div style={{marginBottom:20}}>
          <L text="Notes (optional)"/>
          <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
            placeholder="e.g. Take with water, before workout"
            style={{minHeight:80,resize:'vertical'}}/>
        </div>

        <button onClick={save} disabled={saving||!form.name.trim()}
          style={{width:'100%',padding:'16px',background:'var(--primary)',border:'none',borderRadius:16,color:'var(--primary-contrast)',fontWeight:700,fontSize:16,cursor:'pointer',opacity:!form.name.trim()?0.5:1}}>
          {saving?'Saving…':editId?'Update supplement':'Add supplement'}
        </button>
      </div>
    </div>
  )
}
