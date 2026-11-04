'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EXERCISES, CATEGORIES } from '@/lib/exercises'
import BottomNav from '@/components/BottomNav'

const BODY_PARTS = ['Any body part','Core','Arms','Back','Chest','Legs','Shoulders','Full Body']
const EQUIPMENT_TYPES = [
  'Any category',
  'Barbell','Dumbbell','Machine','Cable','Bodyweight',
  'Band','Kettlebell','Smith Machine','Pull-up Bar',
  'Bench','Box','Ball','Plate','T-Bar Machine',
  'Trap Bar','Wrist Roller','Jump Rope','None'
]

const EXERCISE_VIDEOS: Record<string, string> = {
  // YouTube embed IDs for demo exercises
  'bench_press_barbell': 'vcBig73ojpE',
  'squat_barbell': 'ultWZbUMPL8',
  'deadlift_barbell': 'op9kVnSso6Q',
  'pull_up': 'eGo4IYlbE5g',
  'overhead_press_barbell': 'CnBmiBqp-AI',
  'bent_over_row_barbell': 'vT2GjY_Umpw',
  'incline_bench_press_barbell': 'DbFgADa2PL8',
  'romanian_deadlift_barbell': 'JCXUYuzwNrM',
  'plank': 'ASdvSqAzMms',
  'crunch': 'Xyd_fa5zoEU',
  'bicep_curl_barbell': 'ykJmrZ5v0Oo',
  'tricep_pushdown_cable': 'TwD-YGVP4Bk',
  'lateral_raise_dumbbell': 'kDqklk1ZESo',
  'leg_press': '3ZH51oKNhoc',
  'hip_thrust_barbell': 'xDmFkJxPzeM',
}

function ExercisesContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [search, setSearch] = useState('')
  const [bodyPart, setBodyPart] = useState(params.get('body')||'Any body part')
  const [category, setCategory] = useState(params.get('cat')||'Any category')
  const [selected, setSelected] = useState(null)
  const [showBodyPicker, setShowBodyPicker] = useState(false)
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [showSortPicker, setShowSortPicker] = useState(false)
  const [sort, setSort] = useState('name') // name | category
  const listRef = useRef(null)
  const bodyButtonRef = useRef(null)
  const catButtonRef = useRef(null)
  const sortButtonRef = useRef(null)
  const bodyPickerRef = useRef(null)
  const catPickerRef = useRef(null)
  const sortPickerRef = useRef(null)

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (bodyPickerRef.current && !bodyPickerRef.current.contains(e.target) && bodyButtonRef.current && !bodyButtonRef.current.contains(e.target)) {
        setShowBodyPicker(false)
      }
      if (catPickerRef.current && !catPickerRef.current.contains(e.target) && catButtonRef.current && !catButtonRef.current.contains(e.target)) {
        setShowCatPicker(false)
      }
      if (sortPickerRef.current && !sortPickerRef.current.contains(e.target) && sortButtonRef.current && !sortButtonRef.current.contains(e.target)) {
        setShowSortPicker(false)
      }
    }
    if (showBodyPicker || showCatPicker || showSortPicker) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showBodyPicker, showCatPicker, showSortPicker])

  // Close other popovers when one opens
  const handleBodyPartOpen = () => {
    setShowCatPicker(false)
    setShowSortPicker(false)
    setShowBodyPicker(!showBodyPicker)
  }

  const handleCategoryOpen = () => {
    setShowBodyPicker(false)
    setShowSortPicker(false)
    setShowCatPicker(!showCatPicker)
  }

  const handleSortOpen = () => {
    setShowBodyPicker(false)
    setShowCatPicker(false)
    setShowSortPicker(!showSortPicker)
  }

  const filtered = EXERCISES.filter(e => {
    const matchBody = bodyPart==='Any body part' || e.category===bodyPart ||
      (bodyPart==='Full Body' && (e.category==='Full Body'||e.category==='Olympic'||e.category==='Cardio'))
    const matchCat = category==='Any category' || e.equipment===category
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.muscle.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase())
    return matchBody && matchCat && matchSearch
  }).sort((a,b) => sort==='name' ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category))

  const grouped = filtered.reduce((acc, ex) => {
    const key = sort==='name' ? ex.name[0].toUpperCase() : ex.category
    if (!acc[key]) acc[key]=[]
    acc[key].push(ex)
    return acc
  }, {})

  const keys = Object.keys(grouped).sort()
  const letters = sort==='name' ? keys : keys

  function scrollToLetter(l) {
    const el = document.getElementById('section-'+l)
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' })
  }

  return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:100,position:'relative'}}>

      {/* Sticky header — matches Strong app design */}
      <div style={{position:'sticky',top:0,zIndex:100,background:'var(--surface)',paddingTop:'calc(env(safe-area-inset-top,0px) + 12px)',paddingLeft:'calc(env(safe-area-inset-left,0px) + 20px)',paddingRight:'calc(env(safe-area-inset-right,0px) + 20px)',paddingBottom:10,borderBottom:'1px solid var(--border)',backdropFilter:'blur(12px)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div>
            <p style={{fontSize:12,color:'var(--primary)',fontWeight:600,marginBottom:1}}>New</p>
            <h1 style={{fontSize:24,fontWeight:800,letterSpacing:'-0.02em'}}>Exercises</h1>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button onClick={()=>router.back()} style={{width:36,height:36,borderRadius:10,background:'var(--card)',border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={()=>router.push('/profile')} style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,var(--primary),var(--primary-light))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:'var(--primary-contrast)'}}>?</div>
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{position:'relative',marginBottom:10}}>
          <div style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',fontSize:16}}>🔍</div>
          <input type="text" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}
            style={{paddingLeft:40,background:'var(--card2)',border:'1.5px solid var(--border)',borderRadius:12}}/>
          {search&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:18}}>×</button>}
        </div>

        {/* Filter pills — exactly like your design */}
        <div style={{display:'flex',gap:8,position:'relative'}}>
          <button ref={bodyButtonRef} onClick={handleBodyPartOpen}
            style={{flex:1,padding:'8px 12px',borderRadius:10,border:'1.5px solid var(--border)',background:bodyPart!=='Any body part'?'var(--primary)':'var(--card2)',color:bodyPart!=='Any body part'?'var(--primary-contrast)':'var(--text)',fontSize:12,fontWeight:600,cursor:'pointer',textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {bodyPart}
          </button>
          <button ref={catButtonRef} onClick={handleCategoryOpen}
            style={{flex:1,padding:'8px 12px',borderRadius:10,border:'1.5px solid var(--border)',background:category!=='Any category'?'var(--primary)':'var(--card2)',color:category!=='Any category'?'var(--primary-contrast)':'var(--text)',fontSize:12,fontWeight:600,cursor:'pointer',textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {category}
          </button>
          <button ref={sortButtonRef} onClick={handleSortOpen}
            style={{width:38,height:38,borderRadius:10,border:'1.5px solid var(--border)',background:'var(--card2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>
          </button>

          {/* Body Part Popover Dropdown */}
          {showBodyPicker && bodyButtonRef.current && (
            <div ref={bodyPickerRef} style={{position:'absolute',top:'100%',left:0,marginTop:8,background:'var(--surface)',backdropFilter:'blur(20px)',borderRadius:20,border:'1.5px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',zIndex:300,minWidth:200,maxHeight:320,overflowY:'auto',animation:'popoverIn 0.2s ease'}}>
              {BODY_PARTS.map((bp,i)=>(
                <button key={bp} onClick={()=>{setBodyPart(bp);setShowBodyPicker(false)}}
                  style={{width:'100%',padding:'12px 16px',background:'none',border:'none',borderBottom:i<BODY_PARTS.length-1?'1px solid var(--border)':'none',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',justifyContent:'space-between',WebkitTapHighlightColor:'transparent',transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--card2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div>
                    <div style={{fontWeight:600,fontSize:14,color:bodyPart===bp?'var(--primary)':'var(--text)'}}>{bp}</div>
                    {bp!=='Any body part'&&<div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>
                      {EXERCISES.filter(e=>e.category===bp||(bp==='Full Body'&&(e.category==='Full Body'||e.category==='Olympic'))).length} exercises
                    </div>}
                  </div>
                  {bodyPart===bp&&<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </div>
          )}

          {/* Equipment Popover Dropdown */}
          {showCatPicker && catButtonRef.current && (
            <div ref={catPickerRef} style={{position:'absolute',top:'100%',left:'calc(50% + 20px)',marginTop:8,marginLeft:4,background:'var(--surface)',backdropFilter:'blur(20px)',borderRadius:20,border:'1.5px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',zIndex:300,minWidth:200,maxHeight:320,overflowY:'auto',animation:'popoverIn 0.2s ease'}}>
              {EQUIPMENT_TYPES.map((eq,i)=>(
                <button key={eq} onClick={()=>{setCategory(eq);setShowCatPicker(false)}}
                  style={{width:'100%',padding:'12px 16px',background:'none',border:'none',borderBottom:i<EQUIPMENT_TYPES.length-1?'1px solid var(--border)':'none',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',justifyContent:'space-between',WebkitTapHighlightColor:'transparent',transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--card2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div>
                    <div style={{fontWeight:600,fontSize:14,color:category===eq?'var(--primary)':'var(--text)'}}>{eq}</div>
                    {eq!=='Any category'&&<div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>
                      {EXERCISES.filter(e=>e.equipment===eq).length} exercises
                    </div>}
                  </div>
                  {category===eq&&<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </div>
          )}

          {/* Sort Popover Dropdown */}
          {showSortPicker && sortButtonRef.current && (
            <div ref={sortPickerRef} style={{position:'absolute',top:'100%',right:0,marginTop:8,background:'var(--surface)',backdropFilter:'blur(20px)',borderRadius:20,border:'1.5px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',zIndex:300,minWidth:160,overflow:'hidden',animation:'popoverIn 0.2s ease'}}>
              {[['name','▲ Name'],['category','Category']].map(([val,label],i)=>(
                <button key={val} onClick={()=>{setSort(val);setShowSortPicker(false)}}
                  style={{width:'100%',padding:'12px 16px',background:'none',border:'none',borderBottom:i===0?'1px solid var(--border)':'none',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',justifyContent:'space-between',WebkitTapHighlightColor:'transparent',transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--card2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{fontWeight:600,fontSize:14,color:sort===val?'var(--primary)':'var(--text)'}}>{label}</div>
                  {sort===val&&<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Exercise list */}
      <div ref={listRef} style={{padding:'0 20px'}}>
        {filtered.length===0?(
          <div style={{textAlign:'center',padding:'60px 20px',color:'var(--muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>🔍</div>
            <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>No exercises found</div>
            <div style={{fontSize:13}}>Try a different filter or search term</div>
          </div>
        ):(
          keys.map(key=>(
            <div key={key} id={'section-'+key} style={{marginTop:16}}>
              {/* Letter / category header */}
              <div style={{fontSize:sort==='name'?18:13,fontWeight:sort==='name'?800:700,color:sort==='name'?'var(--text)':'var(--muted)',textTransform:sort!=='name'?'uppercase':'none',letterSpacing:sort!=='name'?'0.08em':'normal',marginBottom:8,paddingBottom:6,borderBottom:'1px solid var(--border)'}}>
                {key}
              </div>

              {grouped[key].map(ex=>(
                <div key={ex.id}>
                  {/* Exercise row — exactly like Strong app */}
                  <button onClick={()=>setSelected(selected?.id===ex.id?null:ex)}
                    style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'12px 0',background:'none',border:'none',cursor:'pointer',textAlign:'left',WebkitTapHighlightColor:'transparent',borderBottom:'0.5px solid var(--border)'}}>

                    {/* Exercise illustration placeholder */}
                    <div style={{width:48,height:48,borderRadius:10,background:'var(--card2)',border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0,overflow:'hidden'}}>
                      {ex.emoji}
                    </div>

                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ex.name}</div>
                      <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{ex.category}</div>
                    </div>

                    {/* Last used reps (placeholder) */}
                    <div style={{fontSize:11,color:'var(--muted)',flexShrink:0,marginRight:4}}>
                      {ex.sets}×{ex.isTime?ex.reps+'s':ex.reps}
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{flexShrink:0,transform:selected?.id===ex.id?'rotate(90deg)':'none',transition:'transform 0.2s'}}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>

                  {/* Expanded detail card */}
                  {selected?.id===ex.id&&(
                    <div style={{background:'var(--card)',borderRadius:20,border:'1.5px solid var(--border)',overflow:'hidden',marginBottom:12,animation:'slideUp 0.25s ease'}}>

                      {/* Video placeholder / embed */}
                      <div style={{background:'var(--espresso)',height:200,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'}}>
                        {EXERCISE_VIDEOS[ex.id] ? (
                          <iframe
                            width="100%"
                            height="200"
                            src={`https://www.youtube.com/embed/${EXERCISE_VIDEOS[ex.id]}?autoplay=0&mute=1&controls=1&modestbranding=1`}
                            frameBorder="0"
                            allowFullScreen
                            style={{border:'none'}}
                          />
                        ) : (
                          <div style={{textAlign:'center',color:'rgba(255,255,255,0.4)'}}>
                            <div style={{fontSize:48,marginBottom:8}}>{ex.emoji}</div>
                            <div style={{fontSize:13,fontWeight:500}}>{ex.name}</div>
                            <div style={{fontSize:11,marginTop:4,opacity:0.6}}>{ex.equipment}</div>
                          </div>
                        )}
                      </div>

                      <div style={{padding:'16px'}}>
                        {/* Name + category */}
                        <div style={{fontWeight:800,fontSize:18,marginBottom:2}}>{ex.name}</div>
                        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                          <div style={{padding:'3px 10px',background:'var(--primary-bg)',borderRadius:99,fontSize:11,fontWeight:600,color:'var(--primary)'}}>{ex.category}</div>
                          <div style={{padding:'3px 10px',background:'var(--card2)',borderRadius:99,fontSize:11,fontWeight:600,color:'var(--muted)'}}>{ex.equipment}</div>
                        </div>

                        {/* Muscles */}
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Target muscles</div>
                          <div style={{fontWeight:600,fontSize:13,color:'var(--text)',marginBottom:4}}>{ex.muscle}</div>
                          {ex.secondary.length>0&&(
                            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:4}}>
                              {ex.secondary.map(m=>(
                                <div key={m} style={{padding:'2px 8px',background:'var(--card2)',borderRadius:99,fontSize:11,color:'var(--muted)',fontWeight:500}}>{m}</div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Divider */}
                        <div style={{height:1,background:'var(--border)',marginBottom:12}}/>

                        {/* Instructions */}
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>How to perform</div>
                          {ex.instructions.split('. ').filter(Boolean).map((step,i)=>(
                            <div key={i} style={{display:'flex',gap:10,marginBottom:8}}>
                              <div style={{width:22,height:22,borderRadius:'50%',background:'var(--primary)',color:'var(--primary-contrast)',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>{i+1}</div>
                              <div style={{fontSize:13,color:'var(--text)',lineHeight:1.6,flex:1}}>{step.trim()}{!step.endsWith('.')?'.':''}</div>
                            </div>
                          ))}
                        </div>

                        {/* Pro tip */}
                        <div style={{background:'var(--orange-bg)',borderRadius:12,padding:'12px 14px',border:'1px solid var(--border)',marginBottom:14}}>
                          <div style={{fontSize:11,fontWeight:700,color:'var(--orange)',marginBottom:4}}>💡 Pro tip</div>
                          <div style={{fontSize:12,color:'var(--orange)',lineHeight:1.6}}>{ex.tips}</div>
                        </div>

                        {/* Add to workout button */}
                        <button onClick={()=>router.push('/workout/active?quick=1&add='+ex.id)}
                          style={{width:'100%',padding:'14px',background:'var(--primary)',border:'none',borderRadius:14,color:'var(--primary-contrast)',fontWeight:700,fontSize:15,cursor:'pointer'}}>
                          + Add to workout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Alphabet index — right side like Strong app */}
      {sort==='name'&&!search&&(
        <div style={{position:'fixed',right:4,top:'50%',transform:'translateY(-50%)',zIndex:50,display:'flex',flexDirection:'column',gap:1}}>
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l=>(
            <button key={l} onClick={()=>scrollToLetter(l)}
              style={{width:20,height:16,background:'none',border:'none',cursor:'pointer',fontSize:9,fontWeight:700,color:grouped[l]?'var(--primary)':'var(--border)',padding:0,lineHeight:1}}>
              {l}
            </button>
          ))}
        </div>
      )}

      <BottomNav/>

      <style>{`
        @keyframes popoverIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}

export default function ExercisesPage() {
  return (
    <Suspense fallback={<div style={{ background: 'var(--surface)', minHeight: '100dvh', maxWidth: 430, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>Loading exercises…</div>}>
      <ExercisesContent />
    </Suspense>
  )
}
