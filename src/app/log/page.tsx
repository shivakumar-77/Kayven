// @ts-nocheck
'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import { updateStreak } from '@/lib/gamification'
import { PageLoader } from '@/components/Skeleton'
import BarcodeScanner from '@/components/BarcodeScanner'
import { SearchIcon, CameraIcon, TagIcon, PackageIcon, EditIcon, StarIcon, ClockIcon, SaladIcon, FoodIcon, ReceiptIcon } from '@/lib/icons'
import { FOOD_DATABASE } from '@/lib/foodDatabase'
import { invalidateDashboardSnapshot } from '@/lib/dashboard-cache'

const MEAL_TYPES = ['breakfast','lunch','dinner','snack','other']
const todayStr = () => new Date().toISOString().slice(0,10)
const HISTORY_KEY = 'Kayven_food_history'
const FAVS_KEY = 'Kayven_favourites'

function getFavs() { try { return JSON.parse(localStorage.getItem(FAVS_KEY)||'[]') } catch { return [] } }
function saveFav(item) {
  const favs = getFavs()
  const exists = favs.find(f => f.name === item.name)
  if (exists) { localStorage.setItem(FAVS_KEY, JSON.stringify(favs.filter(f => f.name !== item.name))); return false }
  favs.unshift(item); localStorage.setItem(FAVS_KEY, JSON.stringify(favs.slice(0,30))); return true
}
function isFav(name) { return getFavs().some(f => f.name === name) }
function formatCatName(cat) {
  const spaced = cat.replace(/([A-Z])/g, ' $1').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]') } catch { return [] } }
function saveHistory(item) {
  const h = getHistory().filter(i => i.name !== item.name)
  h.unshift(item); localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0,20)))
}
function scale(food, qty) {
  const r = qty / (food.baseQty||100)
  return { ...food, qty, cal:Math.round(food.cal*r), protein:Math.round(food.protein*r*10)/10, carb:Math.round(food.carb*r*10)/10, fat:Math.round(food.fat*r*10)/10, fiber:Math.round((food.fiber||0)*r*10)/10 }
}

// The /api/meal-search route returns serving_size/serving_unit (Supabase + OpenFoodFacts field names);
// the rest of this file expects baseQty/unit. This normalizes API results to match, without touching
// food objects that already come from FOOD_DATABASE/history/favourites (which already use baseQty/unit).
function normalizeFood(f) {
  return { ...f, baseQty: f.serving_size ?? f.baseQty ?? 100, unit: f.serving_unit ?? f.unit ?? 'g' }
}

// Searches your local 500+ item FOOD_DATABASE directly (categories -> arrays of foods).
// No network/Supabase dependency, so it works even if the API route or its table is broken.
function searchLocalDatabase(q) {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const all = Object.values(FOOD_DATABASE).flat()
  return all.filter(f => f && f.name && f.name.toLowerCase().includes(needle)).slice(0, 20)
}


const FOOD_CATS = [
  'All','Fruits','Vegetables','Leafy Vegetables','Indian Curries',
  'Dal & Legumes','Rice Dishes','Breads','Breakfast','Snacks',
  'Fast Food','South Indian','North Indian','Chinese','Desserts',
  'Beverages','Protein Powders','Dairy','Eggs','Chicken','Mutton',
  'Fish','Seafood','Nuts','Seeds','Oils','Bakery','Packaged Foods'
]

export default function LogPage() {
  const router = useRouter()
  const [tab, setTab] = useState('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [history, setHistory] = useState([])
  const [favs, setFavs] = useState([])
  const [favNames, setFavNames] = useState(new Set())
  const [showFavs, setShowFavs] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [qty, setQty] = useState(100)
  const [mealType, setMealType] = useState('other')
  const [saving, setSaving] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [manual, setManual] = useState({ name:'', qty:'100', unit:'g', cal:'', protein:'', carb:'', fat:'', fiber:'' })
  const [toastMsg, setToastMsg] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryFoods, setCategoryFoods] = useState([])
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [selectedDiet, setSelectedDiet] = useState(null)
  const fileRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    setHistory(getHistory())
    const f = getFavs(); setFavs(f); setFavNames(new Set(f.map(x => x.name)))
  }, [])

  function showToast(m) { setToastMsg(m); setTimeout(() => setToastMsg(''), 2000) }

  function onQueryChange(val) {
    setQuery(val); setSelected(null)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(() => searchFood(val), 300)
  }

  async function searchFood(q) {
    setSearching(true)
    const needle = q.trim().toLowerCase()
    const local = searchLocalDatabase(q)
    setResults(local) // show instantly — no network wait, no dependency on the API/Supabase working
    try {
      const res = await fetch('/api/meal-search?q=' + encodeURIComponent(q))
      const data = await res.json()
      const apiResults = (data.results ?? [])
        .map(normalizeFood)
        // OpenFoodFacts (the API's fallback source) does a fuzzy/tag search and can return items
        // that don't actually contain the search term in their name — filter those out.
        .filter(f => f.name && f.name.toLowerCase().includes(needle))
      const localNames = new Set(local.map(f => (f.name||'').toLowerCase()))
      setResults([...local, ...apiResults.filter(f => !localNames.has((f.name||'').toLowerCase()))])
    } catch {
      // API failed — local results (already shown above) stay visible instead of being wiped to []
    } finally { setSearching(false) }
  }

  function selectFood(food) { setSelected(food); setQty(food.baseQty||100); setResults([]); setQuery(food.name); setCategoryFoods([]) }

  function selectCategory(catName) {
    setSelectedCategory(catName)
    setCategoryFoods(FOOD_DATABASE[catName] || [])
    setQuery('')
    setShowAllCategories(false)
  }

  function goBackFromCategory() {
    setSelectedCategory(null)
    setCategoryFoods([])
    setSelectedDiet(null)
  }

  const mainCategories = ['fruits', 'vegetables', 'indianCurries', 'breads', 'chicken']
  const allCategories = Object.keys(FOOD_DATABASE)
  const remainingCategories = allCategories.filter(cat => !mainCategories.includes(cat))

  function filterByDiet(foods) {
    if (!selectedDiet) return foods
    return foods.filter(f => {
      if (selectedDiet === 'Veg') return !['chicken', 'mutton', 'fish', 'seafood'].includes(selectedCategory)
      if (selectedDiet === 'Protein') return f.protein >= 20
      if (selectedDiet === 'Low Cal') return f.cal <= 150
      return true
    })
  }

  function toggleFav(food) {
    const added = saveFav({ ...food, baseQty: food.baseQty||100 })
    const f = getFavs(); setFavs(f); setFavNames(new Set(f.map(x => x.name)))
    showToast(added ? 'Added to favourites' : 'Removed from favourites')
  }

  async function logFood(foodOverride) {
    const src = foodOverride || (selected ? scale(selected, qty) : null)
    if (!src) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    await supabase.from('food_logs').insert({
      user_id:user.id, logged_at:todayStr(), name:src.name, qty:src.qty, unit:src.unit||'g',
      cal:src.cal, protein:src.protein, carb:src.carb, fat:src.fat, fiber:src.fiber||0, meal_type:mealType
    })
    invalidateDashboardSnapshot(user.id)
    saveHistory({ name:src.name, cal:src.cal, protein:src.protein, carb:src.carb, fat:src.fat, fiber:src.fiber||0, unit:src.unit||'g', baseQty:src.baseQty||src.qty })
    setHistory(getHistory())
    setSaving(false)
    showToast('Logged to ' + mealType)
    setTimeout(() => router.push('/dashboard'), 700)
  }

  async function logManual() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const entry = {
      user_id:user.id, logged_at:todayStr(), name:manual.name||'Custom food',
      qty:parseFloat(manual.qty)||1, unit:manual.unit,
      cal:parseFloat(manual.cal)||0, protein:parseFloat(manual.protein)||0,
      carb:parseFloat(manual.carb)||0, fat:parseFloat(manual.fat)||0,
      fiber:parseFloat(manual.fiber)||0, meal_type:mealType
    }
    await supabase.from('food_logs').insert(entry)
    invalidateDashboardSnapshot(user.id)
    saveHistory({ name:entry.name, cal:entry.cal, protein:entry.protein, carb:entry.carb, fat:entry.fat, fiber:entry.fiber, unit:entry.unit, baseQty:entry.qty })
    setSaving(false); router.push('/dashboard')
  }

  async function autoFill() {
    if (!manual.name) return; setSearching(true)
    try {
      const needle = manual.name.trim().toLowerCase()
      let f = searchLocalDatabase(manual.name)[0]
      if (!f) {
        const res = await fetch('/api/meal-search?q=' + encodeURIComponent(manual.name))
        const data = await res.json()
        const candidate = data.results?.[0] ? normalizeFood(data.results[0]) : null
        // Same relevance guard as search — don't silently fill in a loosely-matched food's macros
        if (candidate && candidate.name && candidate.name.toLowerCase().includes(needle)) f = candidate
      }
      if (f) {
        setManual(p => ({ ...p, cal:String(f.cal), protein:String(f.protein), carb:String(f.carb), fat:String(f.fat), fiber:String(f.fiber||0), unit:f.unit, qty:String(f.baseQty) }))
      }
    } catch {} finally { setSearching(false) }
  }

  async function scanPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    setScanError(''); setScanning(true)
    const reader = new FileReader()
    reader.onload = async ev => {
      const base64 = ev.target.result.split(',')[1]
      setPhotoPreview(ev.target.result)
      try {
        const res = await fetch('/api/ai-scan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({image:base64, mimeType:file.type, mode:tab==='recipe'?'recipe':'scan'}) })
        const data = await res.json()
        if (data.result) { setSelected({...data.result, baseQty:data.result.qty}); setQty(data.result.qty) }
        else setScanError(data.error||'Could not identify food. Try a clearer photo.')
      } catch { setScanError('Scan failed. Try again.') }
      finally { setScanning(false) }
    }
    reader.readAsDataURL(file); e.target.value=''
  }

  const preview = selected ? scale(selected, qty) : null

  const MacroBadges = ({ p }) => (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
      {[{l:'Cal',v:p.cal,u:'kcal',c:'#6366f1',bg:'#eef2ff'},{l:'Protein',v:p.protein,u:'g',c:'#3b82f6',bg:'#dbeafe'},{l:'Carbs',v:p.carb,u:'g',c:'#f59e0b',bg:'#fef3c7'},{l:'Fat',v:p.fat,u:'g',c:'#ef4444',bg:'#fee2e2'}].map(m=>(
        <div key={m.l} style={{ background:m.bg, borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
          <div style={{ fontSize:10, color:m.c, fontWeight:600, marginBottom:3 }}>{m.l}</div>
          <div style={{ fontSize:16, fontWeight:700, color:m.c }}>{m.v}</div>
          <div style={{ fontSize:10, color:m.c, opacity:0.7 }}>{m.u}</div>
        </div>
      ))}
    </div>
  )

  const QtyPicker = ({ food }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Quantity ({food.unit})</div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
        <button onClick={() => setQty(q => Math.max(food.unit==='piece'||food.unit==='scoop'?1:10, q-(food.unit==='piece'||food.unit==='scoop'?1:10)))}
          style={{ width:44, height:44, borderRadius:12, background:'var(--primary-bg)', border:'1.5px solid var(--primary)', color:'var(--primary)', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0 }}>−</button>
        <input type="text" inputMode="decimal" value={qty}
          onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setQty(v) }}
          style={{ textAlign:'center', fontWeight:700, fontSize:20, flex:1, color:'var(--primary)', border:'1.5px solid var(--primary)', borderRadius:12, padding:'10px', background:'var(--primary-bg)', outline:'none' }}/>
        <button onClick={() => setQty(q => q+(food.unit==='piece'||food.unit==='scoop'?1:10))}
          style={{ width:44, height:44, borderRadius:12, background:'var(--primary)', border:'none', color:'#fff', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0 }}>+</button>
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {(food.unit==='g'||food.unit==='ml'?[50,100,150,200,250,300]:[1,2,3,4,5]).map(v=>(
          <button key={v} onClick={() => setQty(v)}
            style={{ padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer', border:'1.5px solid '+(qty===v?'var(--primary)':'var(--border)'), background:qty===v?'var(--primary-bg)':'transparent', color:qty===v?'var(--primary)':'var(--muted)' }}>
            {v}{food.unit}
          </button>
        ))}
      </div>
    </div>
  )

  const MealPicker = () => (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>Add to meal</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {MEAL_TYPES.map(m=>(
          <button key={m} onClick={() => setMealType(m)}
            style={{ padding:'7px 14px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer', border:'1.5px solid '+(mealType===m?'var(--primary)':'var(--border)'), background:mealType===m?'var(--primary)':'transparent', color:mealType===m?'#fff':'var(--muted)' }}>
            {m.charAt(0).toUpperCase()+m.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )

  const FoodRow = ({ food, onSelect, showStar=true }) => {
    const starred = favNames.has(food.name)
    return (
      <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)' }}>
        <button onClick={() => onSelect(food)} style={{ flex:1, padding:'12px 14px', textAlign:'left', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:14 }}>{food.name}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>per {food.baseQty||100}{food.unit} · <strong style={{ color:'var(--primary)' }}>{food.cal} kcal</strong> · {food.protein}g P</div>
          </div>
        </button>
        {showStar && (
          <button onClick={() => toggleFav(food)}
            style={{ padding:'12px 14px 12px 0', background:'none', border:'none', cursor:'pointer', width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <StarIcon size={18} color={starred?'#f59e0b':'var(--muted)'} strokeWidth={starred?2.5:1.8}/>
          </button>
        )}
      </div>
    )
  }

  const FavCard = ({ food }) => (
    <div style={{ flexShrink:0, width:120, background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:16, overflow:'hidden' }}>
      <div style={{ background:'linear-gradient(135deg,var(--primary-bg),#e0e7ff)', padding:'14px 12px 8px', textAlign:'center' }}>
        <div style={{ marginBottom:4, display:'flex', alignItems:'center', justifyContent:'center' }}><StarIcon size={28} color='#f59e0b'/></div>
        <div style={{ fontWeight:700, fontSize:12, color:'var(--text)', lineHeight:1.3 }}>{food.name}</div>
      </div>
      <div style={{ padding:'8px 10px 10px' }}>
        <div style={{ fontSize:11, color:'var(--primary)', fontWeight:700, marginBottom:6 }}>{food.cal} kcal · {food.protein}g P</div>
        <button onClick={() => logFood(food)} style={{ width:'100%', padding:'7px', borderRadius:10, background:'var(--primary)', color:'#fff', border:'none', fontSize:11, fontWeight:700, cursor:'pointer' }}>
          + Log now
        </button>
      </div>
    </div>
  )

  return (
    <div className="page-root">
      {/* Toast */}
      {toastMsg && (
        <div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', background:'#1e293b', color:'#fff', padding:'10px 20px', borderRadius:99, fontSize:13, fontWeight:600, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
          {toastMsg}
        </div>
      )}

      <h1 style={{ fontSize:24, fontWeight:700, letterSpacing:'-0.02em', marginBottom:20 }}>Log food</h1>

      <div style={{ display:'flex', gap:8, marginBottom:24, overflowX:'auto', paddingBottom:4 }}>
        {[{id:'search',i:SearchIcon,l:'Search'},{id:'scan',i:CameraIcon,l:'AI Scan'},{id:'recipe',i:TagIcon,l:'Recipe'},{id:'barcode',i:PackageIcon,l:'Barcode'},{id:'manual',i:EditIcon,l:'Manual'}].map(t=>{
          const Icon = t.i
          return (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'9px 16px', fontSize:13, fontWeight:600, borderRadius:12, whiteSpace:'nowrap', cursor:'pointer', border:'1.5px solid '+(tab===t.id?'var(--primary)':'var(--border)'), background:tab===t.id?'var(--primary)':'var(--card)', color:tab===t.id?'#fff':'var(--muted)', display:'flex', alignItems:'center', gap:6 }}>
            <Icon size={16} color={tab===t.id?'#fff':'currentColor'} strokeWidth={1.8}/> {t.l}
          </button>
          )
        })}
      </div>

      {/* SEARCH TAB */}
      {tab==='search' && (
        <div>
          <div style={{ position:'relative', marginBottom:16 }}>
            <input type="text" placeholder="Search food — egg, chicken, dosa, dal…" value={query} onChange={e => onQueryChange(e.target.value)} autoFocus style={{ padding:'16px 18px', fontSize:16, fontWeight:500 }}/>
            {query && <button onClick={() => { setQuery(''); setResults([]); setSelected(null) }}
              style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20, padding:0, width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>}
          </div>

          {/* Search results */}
          {results.length>0 && !selected && (
            <div style={{ background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:16, overflow:'hidden', marginBottom:16, boxShadow:'0 4px 16px rgba(0,0,0,0.06)', maxHeight:'320px', overflowY:'auto' }}>
              {results.slice(0, 6).map((r,i) => <FoodRow key={i} food={r} onSelect={selectFood}/>)}
            </div>
          )}

          {searching && <p style={{ color:'var(--muted)', fontSize:13, textAlign:'center', padding:'16px 0' }}>Searching…</p>}

          {/* Categories quick row */}
          {!query && !selected && !selectedCategory && (
            <div style={{ marginBottom:16 }}>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Categories</div>
                <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
                  {mainCategories.map((cat) => (
                    <button key={cat} onClick={() => selectCategory(cat)}
                      style={{ padding:'8px 14px', borderRadius:99, background:'var(--primary-bg)', border:'1.5px solid var(--border)', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--primary)', whiteSpace:'nowrap', flexShrink:0, transition:'all 0.2s' }}>
                      {formatCatName(cat)}
                    </button>
                  ))}
                  <button onClick={() => setShowAllCategories(true)}
                    style={{ padding:'8px 14px', borderRadius:99, background:'var(--primary)', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff', whiteSpace:'nowrap', flexShrink:0, display:'flex', alignItems:'center', gap:5 }}>
                    All categories
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Categories overlay — dropdown-style list of all 26 categories */}
          {showAllCategories && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'flex-end' }}>
              <div style={{ background:'var(--surface)', width:'100%', maxWidth:430, margin:'0 auto', borderRadius:'26px 26px 0 0', maxHeight:'80dvh', display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                  <div style={{ fontWeight:800, fontSize:18, color:'var(--text)' }}>All categories</div>
                  <button onClick={() => setShowAllCategories(false)}
                    style={{ background:'var(--card2)', border:'none', borderRadius:10, width:32, height:32, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div style={{ overflowY:'auto', flex:1, paddingBottom:'calc(env(safe-area-inset-bottom,0px) + 8px)' }}>
                  {allCategories.map((cat, i) => (
                    <button key={cat} onClick={() => { selectCategory(cat); setShowAllCategories(false) }}
                      style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'15px 20px', background:'none', border:'none', borderBottom: i < allCategories.length - 1 ? '1px solid var(--border)' : 'none', cursor:'pointer', textAlign:'left' }}>
                      <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{formatCatName(cat)}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Category foods view */}
          {selectedCategory && categoryFoods.length > 0 && !selected && (
            <div>
              <button onClick={goBackFromCategory} style={{ marginBottom:12, background:'none', border:'none', color:'var(--primary)', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>← Back</button>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:12 }}>{formatCatName(selectedCategory)}</div>
              
              {/* Diet filter when viewing category */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Filter by diet</div>
                <div style={{ display:'flex', gap:6 }}>
                  {['Veg', 'Protein', 'Low Cal'].map((diet) => (
                    <button key={diet} onClick={() => setSelectedDiet(selectedDiet === diet ? null : diet)}
                      style={{ padding:'8px 12px', borderRadius:99, background:selectedDiet===diet?'var(--primary)':'var(--primary-bg)', border:'1.5px solid '+(selectedDiet===diet?'var(--primary)':'var(--border)'), cursor:'pointer', fontSize:12, fontWeight:600, color:selectedDiet===diet?'#fff':'var(--primary)', whiteSpace:'nowrap' }}>
                      {diet}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:16, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.06)', maxHeight:'400px', overflowY:'auto' }}>
                {filterByDiet(categoryFoods).length > 0 ? (
                  filterByDiet(categoryFoods).map((f,i) => <FoodRow key={i} food={f} onSelect={selectFood}/>)
                ) : (
                  <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No foods match your diet filter</div>
                )}
              </div>
            </div>
          )}

          {/* Favourites section */}
          {!query && !selected && !selectedCategory && favs.length>0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'flex', alignItems:'center', gap:6 }}><StarIcon size={14} color='var(--muted)'/> Favourites</div>
                <button onClick={() => setShowFavs(s=>!s)} style={{ background:'none', border:'none', color:'var(--primary)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {showFavs?'Show less':'Show all'}
                </button>
              </div>
              <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                {(showFavs?favs:favs.slice(0,6)).map((f,i) => <FavCard key={i} food={f}/>)}
              </div>
            </div>
          )}

          {/* Recent history */}
          {!query && !selected && !selectedCategory && history.length>0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}><ClockIcon size={14} color='var(--muted)'/> Recent</div>
              <div style={{ background:'var(--card)', border:'1.5px solid var(--border)', borderRadius:16, overflow:'hidden' }}>
                {history.slice(0,8).map((h,i) => <FoodRow key={i} food={h} onSelect={selectFood}/>)}
              </div>
            </div>
          )}

          {!query && !selected && !selectedCategory && history.length===0 && favs.length===0 && (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)' }}>
              <div style={{ width:64, height:64, background:'var(--primary-bg)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}><SaladIcon size={32} color='var(--primary)'/></div>
              <p style={{ fontWeight:600, fontSize:15, marginBottom:6 }}>Browse categories or search</p>
              <p style={{ fontSize:13 }}>egg, chicken, rice, dal, roti, dosa…</p>
              <p style={{ fontSize:12, color:'var(--muted)', marginTop:8, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><StarIcon size={14} color='var(--muted)'/> Star foods to add to favourites</p>
            </div>
          )}

          {/* Selected food */}
          {selected && preview && (
            <div className="slide-up">
              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:17 }}>{selected.name}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>per {selected.baseQty||100} {selected.unit}</div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                    <button onClick={() => toggleFav(selected)}
                      style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:favNames.has(selected.name)?'#f59e0b':'var(--muted)', transition:'color 0.2s' }}>
                      <StarIcon size={18} color={favNames.has(selected.name)?'#f59e0b':'var(--muted)'} strokeWidth={favNames.has(selected.name)?2.5:1.8}/>
                    </button>
                    <button onClick={() => { setSelected(null); setQuery('') }}
                      style={{ width:38, height:38, borderRadius:10, background:'var(--card2)', border:'none', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>×</button>
                  </div>
                </div>
                <MacroBadges p={preview}/>
                <QtyPicker food={selected}/>
                <MealPicker/>
                <button className="btn btn-primary" style={{ width:'100%', padding:'15px', fontSize:15, fontWeight:700 }} onClick={() => logFood()} disabled={saving}>
                  {saving?'Saving…':'Add '+preview.cal+' kcal to '+mealType}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RECIPE SCANNER TAB */}
      {tab==='recipe' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={scanPhoto} style={{ display:'none' }}/>
          {!photoPreview && !selected && (
            <div style={{ textAlign:'center', padding:'24px 0' }}>
              <div style={{ width:80, height:80, background:'linear-gradient(135deg,#f59e0b,#ef4444)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}><TagIcon size={40} color='#fff'/></div>
              <p style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>Recipe & Label Scanner</p>
              <p style={{ color:'var(--muted)', fontSize:13, marginBottom:8, lineHeight:1.7 }}>
                Take a photo of any food label, nutrition facts panel, or recipe card.
              </p>
              <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28, lineHeight:1.7 }}>
                AI reads the nutrition information and automatically fills in all your macros.
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:28 }}>
                {[{Icon:PackageIcon,l:'Food labels'},{Icon:FoodIcon,l:'Recipes'},{Icon:ReceiptIcon,l:'Menus'}].map(x=>(
                  <div key={x.l} style={{ background:'var(--card)', borderRadius:16, padding:'16px 10px', border:'1.5px solid var(--border)', textAlign:'center' }}>
                    <div style={{ width:44, height:44, margin:'0 auto 6px', borderRadius:14, background:'rgba(99,102,241,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <x.Icon size={24} color='#6366f1' />
                    </div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--muted)' }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width:'100%', padding:'16px', fontSize:15, fontWeight:700 }} onClick={() => fileRef.current?.click()}>
                📷 Scan food label or recipe
              </button>
            </div>
          )}

          {scanning && (
            <div style={{ textAlign:'center', padding:'24px 0' }}>
              {photoPreview && <img src={photoPreview} alt="Food" style={{ width:'100%', borderRadius:20, marginBottom:20, maxHeight:280, objectFit:'cover' }}/>}
              <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid var(--primary)', borderTopColor:'transparent', animation:'spin 0.7s linear infinite', margin:'0 auto 16px' }}/>
              <p style={{ color:'var(--muted)', fontSize:14, fontWeight:500 }}>AI is reading nutrition info…</p>
            </div>
          )}

          {scanError && !scanning && (
            <div>
              {photoPreview && <img src={photoPreview} alt="Food" style={{ width:'100%', borderRadius:20, marginBottom:16, maxHeight:280, objectFit:'cover' }}/>}
              <div style={{ background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:14, padding:'12px 16px', marginBottom:16 }}>
                <p style={{ color:'#dc2626', fontSize:13 }}>{scanError}</p>
              </div>
              <button className="btn btn-primary" style={{ width:'100%' }} onClick={() => { setPhotoPreview(null); setScanError(''); fileRef.current?.click() }}>Try again</button>
            </div>
          )}

          {selected && preview && !scanning && tab==='recipe' && (
            <div className="slide-up">
              {photoPreview && <img src={photoPreview} alt="Food" style={{ width:'100%', borderRadius:20, marginBottom:16, maxHeight:240, objectFit:'cover' }}/>}
              <div className="card">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <div style={{ background:'#fef3c7', color:'#d97706', fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, display:'flex', alignItems:'center', gap:6 }}><TagIcon size={14} color='#d97706'/> LABEL SCANNED</div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                  <div style={{ fontWeight:700, fontSize:17 }}>{selected.name}</div>
                  <button onClick={() => toggleFav(selected)}
                    style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:favNames.has(selected.name)?'#f59e0b':'var(--muted)', flexShrink:0 }}>
                    {favNames.has(selected.name)?'AwardIcon':'☆'}
                  </button>
                </div>
                {selected.description && <p style={{ fontSize:13, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>{selected.description}</p>}
                <MacroBadges p={preview}/>
                <QtyPicker food={selected}/>
                <MealPicker/>
                <button className="btn btn-primary" style={{ width:'100%', padding:'15px', fontSize:15, fontWeight:700 }} onClick={() => logFood()} disabled={saving}>
                  {saving?'Saving…':'Add '+preview.cal+' kcal to '+mealType}
                </button>
                <button onClick={() => { setSelected(null); setPhotoPreview(null); setScanError(''); fileRef.current?.click() }}
                  style={{ width:'100%', marginTop:10, background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:13 }}>
                  Scan another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI SCAN TAB */}
      {tab==='scan' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={scanPhoto} style={{ display:'none' }}/>
          {!photoPreview && !selected && (
            <div style={{ textAlign:'center', padding:'24px 0' }}>
              <div style={{ width:80, height:80, background:'var(--primary-bg)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:36 }}>📷</div>
              <p style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>AI Food Scanner</p>
              <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28, lineHeight:1.7 }}>Take a photo of your meal — AI identifies the food and calculates macros automatically</p>
              <button className="btn btn-primary" style={{ width:'100%', padding:'16px', fontSize:15, fontWeight:700 }} onClick={() => fileRef.current?.click()}>
                Take photo of food
              </button>
            </div>
          )}
          {scanning && (
            <div style={{ textAlign:'center', padding:'24px 0' }}>
              {photoPreview && <img src={photoPreview} alt="Food" style={{ width:'100%', borderRadius:20, marginBottom:20, maxHeight:280, objectFit:'cover' }}/>}
              <div style={{ width:36, height:36, borderRadius:'50%', border:'3px solid var(--primary)', borderTopColor:'transparent', animation:'spin 0.7s linear infinite', margin:'0 auto 16px' }}/>
              <p style={{ color:'var(--muted)', fontSize:14 }}>AI is analysing your food…</p>
            </div>
          )}
          {scanError && !scanning && (
            <div>
              {photoPreview && <img src={photoPreview} alt="" style={{ width:'100%', borderRadius:20, marginBottom:16, maxHeight:280, objectFit:'cover' }}/>}
              <div style={{ background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:14, padding:'12px 16px', marginBottom:16 }}>
                <p style={{ color:'#dc2626', fontSize:13 }}>{scanError}</p>
              </div>
              <button className="btn btn-primary" style={{ width:'100%' }} onClick={() => { setPhotoPreview(null); setScanError(''); fileRef.current?.click() }}>Try again</button>
            </div>
          )}
          {selected && preview && !scanning && tab==='scan' && (
            <div className="slide-up">
              {photoPreview && <img src={photoPreview} alt="" style={{ width:'100%', borderRadius:20, marginBottom:16, maxHeight:240, objectFit:'cover' }}/>}
              <div className="card">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ background:'#d1fae5', color:'#059669', fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99 }}>AI IDENTIFIED</div>
                  <button onClick={() => toggleFav(selected)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:favNames.has(selected.name)?'#f59e0b':'var(--muted)' }}>
                    {favNames.has(selected.name)?'AwardIcon':'☆'}
                  </button>
                </div>
                <div style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>{selected.name}</div>
                {selected.description && <p style={{ fontSize:13, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>{selected.description}</p>}
                <MacroBadges p={preview}/>
                <QtyPicker food={selected}/>
                <MealPicker/>
                <button className="btn btn-primary" style={{ width:'100%', padding:'15px', fontSize:15, fontWeight:700 }} onClick={() => logFood()} disabled={saving}>
                  {saving?'Saving…':'Add '+preview.cal+' kcal to '+mealType}
                </button>
                <button onClick={() => { setSelected(null); setPhotoPreview(null); setScanError(''); fileRef.current?.click() }}
                  style={{ width:'100%', marginTop:10, background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:13 }}>Scan another food</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BARCODE */}
      {tab==='barcode' && (
        <BarcodeScanner onResult={f => { setSelected({...f,baseQty:f.qty}); setQty(f.qty); setTab('search') }}/>
      )}

      {/* MANUAL */}
      {tab==='manual' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Food name</div>
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <input type="text" placeholder="e.g. Chicken tikka…" value={manual.name} onChange={e => setManual(p=>({...p,name:e.target.value}))} style={{ flex:1 }}/>
              <button style={{ flexShrink:0, padding:'11px 12px', fontSize:12, fontWeight:600, borderRadius:10, background:'var(--primary)', color:'#fff', border:'none', cursor:'pointer', height:44, display:'flex', alignItems:'center', justifyContent:'center', transition:'opacity 0.2s' }} disabled={!manual.name||searching} onClick={autoFill} title="Auto-fill nutrients from food database">
                {searching?'…':'Fill'}
              </button>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Quantity</div>
              <input type="text" inputMode="decimal" value={manual.qty} onChange={e => setManual(p=>({...p,qty:e.target.value}))}/>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Unit</div>
              <select value={manual.unit} onChange={e => setManual(p=>({...p,unit:e.target.value}))}>
                <option value="piece">piece / egg</option>
                <option value="g">grams (g)</option>
                <option value="ml">ml</option>
                <option value="scoop">scoop</option>
                <option value="slice">slice</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[{l:'Calories (kcal)',k:'cal',c:'#6366f1'},{l:'Protein (g)',k:'protein',c:'#3b82f6'},{l:'Carbs (g)',k:'carb',c:'#f59e0b'},{l:'Fat (g)',k:'fat',c:'#ef4444'},{l:'Fiber (g)',k:'fiber',c:'#10b981'}].map(f=>(
              <div key={f.k}>
                <div style={{ fontSize:12, fontWeight:700, color:f.c, marginBottom:6 }}>{f.l}</div>
                <input type="text" inputMode="decimal" placeholder="0" value={manual[f.k]} onChange={e => setManual(p=>({...p,[f.k]:e.target.value}))}/>
              </div>
            ))}
          </div>
          <MealPicker/>
          <button className="btn btn-primary" style={{ padding:'15px', fontSize:15, fontWeight:700 }} onClick={logManual} disabled={saving}>
            {saving?'Saving…':'Add to log'}
          </button>
        </div>
      )}

      <BottomNav/>
    </div>
  )
}
