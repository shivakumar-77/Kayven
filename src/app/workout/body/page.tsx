// @ts-nocheck
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EXERCISES } from '@/lib/exercises'
import BottomNav from '@/components/BottomNav'

const MUSCLE_GROUPS = [
  { id:'Chest',     label:'Chest',     emoji:'🫁', color:'var(--primary)', desc:'Pectoralis major, minor', front:true,
    muscles:['Pectoralis Major','Pectoralis Minor','Serratus Anterior'] },
  { id:'Shoulders', label:'Shoulders', emoji:'MuscleIcon', color:'var(--blue)', desc:'Front, side & rear delts', front:true,
    muscles:['Anterior Deltoid','Lateral Deltoid','Posterior Deltoid'] },
  { id:'Arms',      label:'Arms',      emoji:'MuscleIcon', color:'var(--primary-light)', desc:'Biceps, triceps, forearms', front:true,
    muscles:['Biceps Brachii','Brachialis','Triceps Brachii','Forearms'] },
  { id:'Core',      label:'Core',      emoji:'FireIcon', color:'var(--green)', desc:'Abs, obliques, lower back', front:true,
    muscles:['Rectus Abdominis','Obliques','Transverse Abdominis','Erector Spinae'] },
  { id:'Legs',      label:'Legs',      emoji:'LegIcon', color:'var(--orange)', desc:'Quads, hamstrings, glutes, calves', front:true,
    muscles:['Quadriceps','Hamstrings','Glutes','Gastrocnemius','Soleus'] },
  { id:'Back',      label:'Back',      emoji:'MuscleIcon', color:'var(--red)', desc:'Lats, traps, rhomboids', front:false,
    muscles:['Latissimus Dorsi','Trapezius','Rhomboids','Erector Spinae'] },
  { id:'Full Body', label:'Full Body', emoji:'BoltIcon', color:'var(--blue)', desc:'Olympic & compound movements', front:true,
    muscles:['All major muscle groups'] },
  { id:'Cardio',    label:'Cardio',    emoji:'PlayIcon', color:'var(--water)', desc:'Cardiovascular training', front:true,
    muscles:['Cardiovascular system'] },
]

export default function BodyMapPage() {
  const router = useRouter()
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('front')
  const [gender, setGender] = useState('male')
  const [exSearch, setExSearch] = useState('')

  const selectedGroup = selected ? MUSCLE_GROUPS.find(g=>g.id===selected) : null
  const groupExercises = selected
    ? EXERCISES.filter(e => {
        if (selected==='Full Body') return e.category==='Full Body'||e.category==='Olympic'
        if (selected==='Cardio') return e.category==='Cardio'
        return e.category===selected
      }).filter(e => !exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase()))
    : []

  function toRad(d) { return d * Math.PI / 180 }

  // Segment definitions: from=deg(left), to=deg right on upper semicircle
  // 180=far left, 0=far right, 90=top
  function arcPath(cx, cy, r, fromDeg, toDeg, ri=0) {
    const x1 = cx + r*Math.cos(toRad(fromDeg)), y1 = cy - r*Math.sin(toRad(fromDeg))
    const x2 = cx + r*Math.cos(toRad(toDeg)),   y2 = cy - r*Math.sin(toRad(toDeg))
    const large = Math.abs(toDeg-fromDeg) > 180 ? 1 : 0
    const sweep = toDeg < fromDeg ? 1 : 0
    if (ri > 0) {
      const xi1 = cx + ri*Math.cos(toRad(fromDeg)), yi1 = cy - ri*Math.sin(toRad(fromDeg))
      const xi2 = cx + ri*Math.cos(toRad(toDeg)),   yi2 = cy - ri*Math.sin(toRad(toDeg))
      return `M${x1} ${y1} A${r} ${r} 0 ${large} ${sweep} ${x2} ${y2} L${xi2} ${yi2} A${ri} ${ri} 0 ${large} ${1-sweep} ${xi1} ${yi1} Z`
    }
    return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} ${sweep} ${x2} ${y2} Z`
  }

  return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:100}}>
      <div style={{padding:'calc(env(safe-area-inset-top,0px) + 12px) 20px 0'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
          <button onClick={()=>router.back()} style={{width:36,height:36,borderRadius:10,background:'var(--card)',border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{flex:1}}>
            <h1 style={{fontSize:22,fontWeight:700}}>Body Anatomy</h1>
            <p style={{fontSize:12,color:'var(--muted)',marginTop:1}}>Tap a muscle group to see exercises</p>
          </div>
          {/* Gender toggle */}
          <div style={{display:'flex',background:'var(--card2)',borderRadius:10,padding:2,border:'1.5px solid var(--border)'}}>
            {['male','female'].map(g=>(
              <button key={g} onClick={()=>setGender(g)}
                style={{padding:'5px 10px',borderRadius:8,border:'none',fontSize:11,fontWeight:600,cursor:'pointer',background:gender===g?'var(--primary)':'transparent',color:gender===g?'var(--primary-contrast)':'var(--muted)',textTransform:'capitalize',WebkitTapHighlightColor:'transparent'}}>
                {g==='male'?'♂ M':'♀ F'}
              </button>
            ))}
          </div>
        </div>

        {/* Front / Back toggle */}
        <div style={{display:'flex',background:'var(--card2)',borderRadius:14,padding:4,marginBottom:20,border:'1.5px solid var(--border)'}}>
          {['front','back'].map(v=>(
            <button key={v} onClick={()=>{setView(v);if(selected&&v==='front'&&selected==='Back')setSelected(null);if(selected&&v==='back'&&['Chest','Core'].includes(selected))setSelected(null)}}
              style={{flex:1,padding:'10px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,cursor:'pointer',background:view===v?'var(--primary)':'transparent',color:view===v?'var(--primary-contrast)':'var(--muted)',textTransform:'capitalize',WebkitTapHighlightColor:'transparent'}}>
              {v==='front'?'Front View':'Back View'}
            </button>
          ))}
        </div>

        {/* SVG Body illustration */}
        <div style={{background:'var(--card)',borderRadius:24,border:'1.5px solid var(--border)',padding:'16px',marginBottom:20}}>
          <svg width="100%" viewBox="0 0 300 440" style={{display:'block',maxHeight:400}}>
            {/* ── BODY OUTLINE ── */}
            {/* Head */}
            <ellipse cx="150" cy="32" rx="24" ry="28" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Neck */}
            <rect x="141" y="58" width="18" height="20" rx="4" fill="var(--card2)" stroke="var(--border)" strokeWidth="1"/>
            {/* Torso */}
            <path d="M100 78 L200 78 L206 200 L94 200 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Left upper arm */}
            <path d="M100 82 L72 88 L58 170 L80 175 L92 108 L106 102 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Right upper arm */}
            <path d="M200 82 L228 88 L242 170 L220 175 L208 108 L194 102 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Left forearm */}
            <path d="M58 170 L52 235 L72 237 L80 175 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Right forearm */}
            <path d="M242 170 L248 235 L228 237 L220 175 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Left leg */}
            <path d="M112 200 L98 310 L112 312 L136 212 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Right leg */}
            <path d="M188 200 L202 310 L188 312 L164 212 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Left calf */}
            <path d="M98 310 L94 390 L110 393 L112 312 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>
            {/* Right calf */}
            <path d="M202 310 L206 390 L190 393 L188 312 Z" fill="var(--card2)" stroke="var(--border)" strokeWidth="1.5"/>

            {/* ── CLICKABLE MUSCLE ZONES ── */}
            {view==='front' ? (
              <>
                {/* Chest */}
                <ellipse cx="150" cy="130" rx="38" ry="30"
                  fill={selected==='Chest'?'var(--primary)':'var(--primary)'} fillOpacity={selected==='Chest'?0.75:0.22}
                  stroke="var(--primary)" strokeWidth={selected==='Chest'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Chest'?null:'Chest')}/>
                <text x="150" y="134" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--primary)" style={{pointerEvents:'none'}}>CHEST</text>

                {/* Shoulders */}
                <ellipse cx="83" cy="100" rx="20" ry="14"
                  fill={selected==='Shoulders'?'var(--blue)':'var(--blue)'} fillOpacity={selected==='Shoulders'?0.75:0.22}
                  stroke="var(--blue)" strokeWidth={selected==='Shoulders'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Shoulders'?null:'Shoulders')}/>
                <ellipse cx="217" cy="100" rx="20" ry="14"
                  fill={selected==='Shoulders'?'var(--blue)':'var(--blue)'} fillOpacity={selected==='Shoulders'?0.75:0.22}
                  stroke="var(--blue)" strokeWidth={selected==='Shoulders'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Shoulders'?null:'Shoulders')}/>
                <text x="150" y="97" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--blue)" style={{pointerEvents:'none'}}>SHOULDERS</text>

                {/* Arms */}
                <ellipse cx="68" cy="138" rx="14" ry="26"
                  fill={selected==='Arms'?'var(--primary-light)':'var(--primary-light)'} fillOpacity={selected==='Arms'?0.75:0.22}
                  stroke="var(--primary-light)" strokeWidth={selected==='Arms'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Arms'?null:'Arms')}/>
                <ellipse cx="232" cy="138" rx="14" ry="26"
                  fill={selected==='Arms'?'var(--primary-light)':'var(--primary-light)'} fillOpacity={selected==='Arms'?0.75:0.22}
                  stroke="var(--primary-light)" strokeWidth={selected==='Arms'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Arms'?null:'Arms')}/>
                <text x="150" y="145" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--primary-light)" style={{pointerEvents:'none'}}>ARMS</text>

                {/* Core */}
                <rect x="112" y="163" width="76" height="34" rx="10"
                  fill={selected==='Core'?'var(--green)':'var(--green)'} fillOpacity={selected==='Core'?0.75:0.22}
                  stroke="var(--green)" strokeWidth={selected==='Core'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Core'?null:'Core')}/>
                <text x="150" y="183" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--green)" style={{pointerEvents:'none'}}>CORE</text>

                {/* Legs quads */}
                <ellipse cx="120" cy="258" rx="20" ry="50"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.75:0.22}
                  stroke="var(--orange)" strokeWidth={selected==='Legs'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
                <ellipse cx="180" cy="258" rx="20" ry="50"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.75:0.22}
                  stroke="var(--orange)" strokeWidth={selected==='Legs'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
                <text x="150" y="261" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--orange)" style={{pointerEvents:'none'}}>LEGS</text>

                {/* Calves */}
                <ellipse cx="101" cy="352" rx="12" ry="32"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.5:0.15}
                  stroke="var(--orange)" strokeWidth="1" style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
                <ellipse cx="199" cy="352" rx="12" ry="32"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.5:0.15}
                  stroke="var(--orange)" strokeWidth="1" style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
              </>
            ) : (
              <>
                {/* Back */}
                <path d="M105 84 L150 96 L195 84 L200 185 L150 198 L100 185 Z"
                  fill={selected==='Back'?'var(--red)':'var(--red)'} fillOpacity={selected==='Back'?0.75:0.3}
                  stroke="var(--red)" strokeWidth={selected==='Back'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Back'?null:'Back')}/>
                <text x="150" y="142" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--red)" style={{pointerEvents:'none'}}>BACK</text>
                <text x="150" y="154" textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--red)" style={{pointerEvents:'none'}}>LATS · TRAPS</text>

                {/* Rear Shoulders */}
                <ellipse cx="83" cy="100" rx="20" ry="14"
                  fill={selected==='Shoulders'?'var(--blue)':'var(--blue)'} fillOpacity={selected==='Shoulders'?0.75:0.22}
                  stroke="var(--blue)" strokeWidth={selected==='Shoulders'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Shoulders'?null:'Shoulders')}/>
                <ellipse cx="217" cy="100" rx="20" ry="14"
                  fill={selected==='Shoulders'?'var(--blue)':'var(--blue)'} fillOpacity={selected==='Shoulders'?0.75:0.22}
                  stroke="var(--blue)" strokeWidth={selected==='Shoulders'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Shoulders'?null:'Shoulders')}/>

                {/* Triceps */}
                <ellipse cx="68" cy="138" rx="14" ry="26"
                  fill={selected==='Arms'?'var(--primary-light)':'var(--primary-light)'} fillOpacity={selected==='Arms'?0.75:0.22}
                  stroke="var(--primary-light)" strokeWidth={selected==='Arms'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Arms'?null:'Arms')}/>
                <ellipse cx="232" cy="138" rx="14" ry="26"
                  fill={selected==='Arms'?'var(--primary-light)':'var(--primary-light)'} fillOpacity={selected==='Arms'?0.75:0.22}
                  stroke="var(--primary-light)" strokeWidth={selected==='Arms'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Arms'?null:'Arms')}/>
                <text x="150" y="141" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--primary-light)" style={{pointerEvents:'none'}}>TRICEPS</text>

                {/* Glutes */}
                <ellipse cx="125" cy="210" rx="24" ry="18"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.75:0.3}
                  stroke="var(--orange)" strokeWidth={selected==='Legs'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
                <ellipse cx="175" cy="210" rx="24" ry="18"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.75:0.3}
                  stroke="var(--orange)" strokeWidth={selected==='Legs'?2.5:1}
                  style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
                <text x="150" y="213" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--orange)" style={{pointerEvents:'none'}}>GLUTES</text>

                {/* Hamstrings */}
                <ellipse cx="120" cy="270" rx="18" ry="44"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.6:0.2}
                  stroke="var(--orange)" strokeWidth="1" style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
                <ellipse cx="180" cy="270" rx="18" ry="44"
                  fill={selected==='Legs'?'var(--orange)':'var(--orange)'} fillOpacity={selected==='Legs'?0.6:0.2}
                  stroke="var(--orange)" strokeWidth="1" style={{cursor:'pointer'}} onClick={()=>setSelected(s=>s==='Legs'?null:'Legs')}/>
                <text x="150" y="272" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--orange)" style={{pointerEvents:'none'}}>HAMSTRINGS</text>
              </>
            )}
          </svg>

          <div style={{textAlign:'center',fontSize:11,color:'var(--muted)',marginTop:4}}>Tap any muscle group</div>
        </div>

        {/* Muscle chips row */}
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:selected?20:0}}>
          {MUSCLE_GROUPS.filter(g=>view==='front'?g.id!=='Back':g.id!=='Chest'&&g.id!=='Core').map(g=>(
            <button key={g.id} onClick={()=>setSelected(s=>s===g.id?null:g.id)}
              style={{padding:'8px 14px',borderRadius:99,fontSize:12,fontWeight:700,cursor:'pointer',border:'2px solid '+(selected===g.id?g.color:'var(--border)'),background:selected===g.id?g.color:'var(--card)',color:selected===g.id?'var(--colored-label)':'var(--text)',transition:'all 0.15s',WebkitTapHighlightColor:'transparent'}}>
              {g.emoji} {g.label}
            </button>
          ))}
        </div>

        {/* Selected muscle detail */}
        {selected&&selectedGroup&&(
          <div style={{animation:'slideUp 0.25s ease'}}>
            <div style={{background:'var(--card)',borderRadius:20,border:'1.5px solid var(--border)',overflow:'hidden',marginBottom:16}}>
              {/* Gradient header */}
              <div style={{background:`linear-gradient(135deg,${selectedGroup.color},color-mix(in srgb, ${selectedGroup.color} 82%, var(--surface)))`,padding:'18px 20px',color:'var(--colored-label)'}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                  <div style={{fontSize:32}}>{selectedGroup.emoji}</div>
                  <div>
                    <div style={{fontSize:20,fontWeight:800}}>{selectedGroup.label}</div>
                    <div style={{fontSize:12,opacity:0.85,marginTop:2}}>{selectedGroup.desc}</div>
                  </div>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {selectedGroup.muscles.map(m=>(
                    <div key={m} style={{padding:'3px 10px',background:'rgba(255,255,255,0.2)',borderRadius:99,fontSize:11,fontWeight:600}}>{m}</div>
                  ))}
                </div>
              </div>

              {/* Exercise search within group */}
              <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)'}}>
                <input type="text" placeholder={'Search '+selected+' exercises…'} value={exSearch}
                  onChange={e=>setExSearch(e.target.value)} style={{margin:0}}/>
              </div>

              {/* Exercise count */}
              <div style={{padding:'10px 16px',fontSize:12,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid var(--border)'}}>
                {groupExercises.length} exercises
              </div>

              {/* Exercise list */}
              <div style={{maxHeight:400,overflowY:'auto'}}>
                {groupExercises.map(ex=>(
                  <button key={ex.id}
                    onClick={()=>router.push('/workout/exercises?body='+selected+'#'+ex.id)}
                    style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'14px 16px',background:'none',border:'none',borderBottom:'0.5px solid var(--border)',cursor:'pointer',textAlign:'left',WebkitTapHighlightColor:'transparent'}}>
                    <div style={{width:44,height:44,borderRadius:12,background:'var(--primary-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                      {ex.emoji}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ex.name}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                        {ex.equipment} · {ex.sets}×{ex.isTime?ex.reps+'s':ex.reps+' reps'}
                      </div>
                      <div style={{fontSize:11,color:selectedGroup.color,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ex.muscle}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>

              {/* View all button */}
              <div style={{padding:'14px 16px'}}>
                <button onClick={()=>router.push('/workout/exercises?body='+selected)}
                  style={{width:'100%',padding:'13px',background:selectedGroup.color,border:'none',borderRadius:14,color:'var(--primary-contrast)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
                  View all {selectedGroup.label} exercises →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  )
}
