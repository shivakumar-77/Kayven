'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'
import NextBestActionCard from '@/components/NextBestActionCard'
import { SkeletonDashboard, PageLoader } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { FireIcon, DropletIcon, TargetIcon, BoltIcon, ChartBarIcon, MealPlanIcon, AIIcon, ScaleIcon, CheckIcon, MuscleIcon, WarningIcon, TrophyIcon, SunriseIcon, SunIcon, MoonIcon, AppleIcon, FoodIcon, PartyIcon, SupplementIcon, RobotIcon, WaveIcon } from '@/lib/icons'
import { useSubscription } from '@/lib/billing/client'

const today = () => new Date().toISOString().slice(0, 10)

const FOOD_IMAGES = {
  egg: 'https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=80&h=80&fit=crop',
  chicken: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=80&h=80&fit=crop',
  rice: 'https://images.unsplash.com/photo-1536304993881-ff86e0c9ef88?w=80&h=80&fit=crop',
  dal: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=80&h=80&fit=crop',
  roti: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=80&h=80&fit=crop',
  paneer: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=80&h=80&fit=crop',
  dosa: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=80&h=80&fit=crop',
  idli: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=80&h=80&fit=crop',
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=80&h=80&fit=crop',
  oats: 'https://images.unsplash.com/photo-1614961233913-a5113a4a34ed?w=80&h=80&fit=crop',
  banana: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=80&h=80&fit=crop',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=80&h=80&fit=crop',
  protein: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=80&h=80&fit=crop',
  milk: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=80&h=80&fit=crop',
  default: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=80&h=80&fit=crop',
}

function getFoodImage(name) {
  const n = name.toLowerCase()
  for (const [key, url] of Object.entries(FOOD_IMAGES)) {
    if (n.includes(key)) return url
  }
  return FOOD_IMAGES.default
}

const STATUS_CONFIG = {
  on_track: { iconType: 'check', label: 'On track', color: 'var(--green)', bg: 'var(--green-bg)' },
  low_protein: { iconType: 'muscle', label: 'Low protein', color: 'var(--blue)', bg: 'var(--blue-bg)' },
  low_calories: { iconType: 'bolt', label: 'Need more food', color: 'var(--orange)', bg: 'var(--orange-bg)' },
  over_calories: { iconType: 'warning', label: 'Over calories', color: 'var(--red)', bg: 'var(--red-bg)' },
  great: { iconType: 'trophy', label: 'Perfect day!', color: 'var(--green)', bg: 'var(--green-bg)' },
}

// ---------- Presentation-only helpers (new) ----------

// Large hero ring for calories, centerpiece of the daily summary card
function CalorieRing({ consumed, target, size = 188, strokeWidth = 15 }) {
  const safeTarget = target || 1
  const pct = Math.max(0, Math.min(1, consumed / safeTarget))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  const over = consumed > safeTarget
  const remaining = Math.round(Math.abs(safeTarget - consumed))

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--card2)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={over ? 'var(--red)' : 'url(#calRingGradient)'}
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
        />
        <defs>
          <linearGradient id="calRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary-light)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <FireIcon size={16} color={over ? 'var(--red)' : 'var(--primary)'} />
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1 }}>
          {Math.round(consumed)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 3 }}>
          of {Math.round(safeTarget)} kcal
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, marginTop: 8, padding: '3px 11px', borderRadius: 99,
          background: over ? 'var(--red-bg)' : 'var(--primary-bg)', color: over ? 'var(--red)' : 'var(--primary)'
        }}>
          {over ? `${remaining} over` : `${remaining} left`}
        </div>
      </div>
    </div>
  )
}

// Small ring used four times (protein / carbs / fat / fiber)
function MiniRing({ label, value, target, unit, color, size = 62, strokeWidth = 5 }) {
  const safeTarget = target || 1
  const pct = Math.max(0, Math.min(1, value / safeTarget))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--card2)" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color}
            strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
          {Math.round(pct * 100)}%
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, marginTop: 1 }}>
          {Math.round(value)}/{Math.round(target)}{unit}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [logs, setLogs] = useState([])
  const [waterMl, setWaterMl] = useState(0)
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState(null)
  const [sugLoading, setSugLoading] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [scrolled, setScrolled] = useState(false) // new: drives the floating header's frosted state
  const { state: subscriptionState } = useSubscription()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth'); return }
    const [{ data: prof }, { data: foodLogs }, { data: waterLogs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('food_logs').select('*').eq('user_id', user.id).eq('logged_at', today()).order('created_at'),
      supabase.from('water_logs').select('amount_ml').eq('user_id', user.id).eq('logged_at', today())
    ])
    if (prof) setProfile(prof)
    if (foodLogs) setLogs(foodLogs)
    if (waterLogs) setWaterMl(waterLogs.reduce((s, l) => s + l.amount_ml, 0))
    setLoading(false)
    if (prof && foodLogs?.length > 0) loadSuggestions(prof, foodLogs)
  }, [router])

  useEffect(() => { load() }, [load])

  // new: purely visual — toggles the header's transparent -> frosted-glass state on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function loadSuggestions(prof, foodLogs) {
    setSugLoading(true)
    try {
      const totals = foodLogs.reduce((a, l) => ({ cal: a.cal+l.cal, protein: a.protein+l.protein, carb: a.carb+l.carb, fat: a.fat+l.fat }), { cal:0, protein:0, carb:0, fat:0 })
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totals, targets: { cal: prof.cal_target, protein: prof.protein_target, carb: prof.carb_target, fat: prof.fat_target }, logs: foodLogs })
      })
      const data = await res.json()
      if (data.result) setSuggestions(data.result)
    } catch {} finally { setSugLoading(false) }
  }

  const totals = logs.reduce((a, l) => ({ cal: a.cal+l.cal, protein: a.protein+l.protein, carb: a.carb+l.carb, fat: a.fat+l.fat, fiber: a.fiber+l.fiber }), { cal:0, protein:0, carb:0, fat:0, fiber:0 })
  const g = profile ?? { cal_target:1700, protein_target:167, carb_target:144, fat_target:60, fiber_target:25, water_goal:2000 }
  const waterGoal = g.water_goal || 2000
  const waterPct = Math.min(1, waterMl / waterGoal)

  async function deleteLog(id) {
    await supabase.from('food_logs').delete().eq('id', id)
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  const mealGroups = ['breakfast','lunch','dinner','snack','other']
  const mealColors = { breakfast:'var(--orange)', lunch:'var(--green)', dinner:'var(--primary)', snack:'var(--red)', other:'var(--muted)' }
  const mealIconTypes = { breakfast:'sunrise', lunch:'sun', dinner:'moon', snack:'apple', other:'food' }

  const getIcon = (type) => {
    const iconMap = {
      check: <CheckIcon size={16} color={statusConf.color}/>,
      muscle: <MuscleIcon size={16} color={statusConf.color}/>,
      bolt: <BoltIcon size={16} color={statusConf.color}/>,
      warning: <WarningIcon size={16} color={statusConf.color}/>,
      trophy: <TrophyIcon size={16} color={statusConf.color}/>,
      sunrise: <SunriseIcon size={14}/>,
      sun: <SunIcon size={14}/>,
      moon: <MoonIcon size={14}/>,
      apple: <AppleIcon size={14}/>,
      food: <FoodIcon size={14}/>,
    }
    return iconMap[type] || null
  }

  const getMealIcon = (meal) => {
    const iconMap = {
      breakfast: <SunriseIcon size={18}/>,
      lunch: <SunIcon size={18}/>,
      dinner: <MoonIcon size={18}/>,
      snack: <AppleIcon size={18}/>,
      other: <FoodIcon size={18}/>,
    }
    return iconMap[meal] || null
  }

  if (loading) return <SkeletonDashboard/>

  const statusConf = suggestions ? (STATUS_CONFIG[suggestions.status] || STATUS_CONFIG.on_track) : null

  // Unified quick-action rows (Meal Planner / Insights / Supplements) — same routes as before
  const quickActions = [
    { icon: <MealPlanIcon size={19} color="var(--green)"/>, iconBg: 'var(--green-bg)', title: 'Meal Planner', sub: 'AI-generated daily plan', path: '/meal-plan' },
    { icon: <ChartBarIcon size={19} color="var(--primary)"/>, iconBg: 'var(--primary-bg)', title: 'Insights', sub: 'Weekly AI nutrition report', path: '/insights' },
    { icon: <SupplementIcon size={19} color="#ec4899"/>, iconBg: '#fce7f3', title: 'Supplements', sub: 'Track daily intake', path: '/supplements' },
  ]

  return (
    <div className="page-root">
      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in-up { animation: fadeInUp 0.5s cubic-bezier(.4,0,.2,1) both; }
        .qa-row { transition: background-color 0.15s ease; }
        .qa-row:active { background-color: var(--card2); }
      `}</style>

      {/* Transparent floating header — frosts on scroll */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '10px 0 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'var(--surface)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
        marginBottom: scrolled ? 4 : 0,
        transition: 'background-color 0.25s ease, border-color 0.25s ease',
      }}>
        <div>
          <p style={{ color:'var(--muted)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })}
          </p>
          {subscriptionState && <button type="button" onClick={() => router.push('/subscription')} style={{ marginTop: 5, border: 0, padding: 0, background: 'none', color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {subscriptionState.currentPlan.charAt(0).toUpperCase() + subscriptionState.currentPlan.slice(1)} Plan · {subscriptionState.remainingAIRequests === null ? 'AI unlimited' : `${subscriptionState.remainingAIRequests} AI left`}
          </button>}
          <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.03em', marginTop:3, display:'flex', alignItems:'center', gap:8 }}>
            {profile?.name ? <>Hey, {profile.name.split(' ')[0]} <WaveIcon size={22}/></> : 'Today'}
          </h1>
        </div>
        <button onClick={() => router.push('/profile')} className="press-effect" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', overflow:'hidden', background:'linear-gradient(135deg,var(--primary),var(--primary-light))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:800, color:'#fff', border:'2px solid var(--border)' }}>
            {profile?.photo_url ? <img src={profile.photo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : (profile?.name?.[0]?.toUpperCase() || '?')}
          </div>
        </button>
      </div>

      {/* AI tip banner */}
      {suggestions?.tip && (
        <div className="fade-in-up" style={{ marginTop:4, marginBottom:14, padding:'12px 16px', background:'var(--primary-bg)', borderRadius:16, display:'flex', gap:10, alignItems:'center' }}>
          <RobotIcon size={19} color='var(--primary)' strokeWidth={1.5}/>
          <span style={{ fontSize:13, color:'var(--primary)', fontWeight:500, lineHeight:1.5 }}>{suggestions.tip}</span>
        </div>
      )}

      {/* Daily summary — hero calorie ring + 4 mini macro rings, single card */}
      <div
        onClick={() => router.push('/calories')}
        className="card press-effect fade-in-up"
        style={{ padding:'22px 20px 18px', cursor:'pointer', position:'relative', animationDelay:'0.05s' }}
      >
        {statusConf && (
          <div style={{ position:'absolute', top:16, right:16, display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:99, background:statusConf.bg }}>
            {getIcon(statusConf.iconType)}
            <span style={{ fontSize:11, fontWeight:700, color:statusConf.color }}>{statusConf.label}</span>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'center', paddingTop: statusConf ? 30 : 4 }}>
          <CalorieRing consumed={totals.cal} target={g.cal_target}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginTop:24 }}>
          <MiniRing label="Protein" value={totals.protein} target={g.protein_target} unit="g" color="var(--blue)"/>
          <MiniRing label="Carbs" value={totals.carb} target={g.carb_target} unit="g" color="var(--orange)"/>
          <MiniRing label="Fat" value={totals.fat} target={g.fat_target} unit="g" color="var(--red)"/>
          <MiniRing label="Fiber" value={totals.fiber} target={g.fiber_target} unit="g" color="var(--green)"/>
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, marginTop:20, paddingTop:14, borderTop:'1px solid var(--border)' }}>
          <span style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>View full breakdown</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      {/* AI Food Suggestions */}
      {(sugLoading || suggestions?.suggestions?.length > 0) && (
        <div className="card fade-in-up" style={{ marginTop:14, animationDelay:'0.1s' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:8 }}><RobotIcon size={18} strokeWidth={1.5}/> AI suggestions</div>
            <span style={{ fontSize:11, color:'var(--muted)' }}>to complete your macros</span>
          </div>
          {sugLoading ? (
            <div style={{ display:'flex', gap:8 }}>
              {[1,2,3].map(i=><div key={i} style={{ flex:1, height:60, background:'var(--card2)', borderRadius:12 }}/>)}
            </div>
          ) : (
            <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
              {suggestions?.suggestions?.map((s,i)=>(
                <div key={i} style={{ flexShrink:0, background:'var(--card2)', borderRadius:14, padding:'12px', width:130, cursor:'pointer' }}
                  onClick={() => { setExpanded(expanded===i?null:i) }}>
                  <img src={getFoodImage(s.name)} alt={s.name}
                    style={{ width:'100%', height:60, objectFit:'cover', borderRadius:8, marginBottom:8 }}
                    onError={e => { e.currentTarget.src = FOOD_IMAGES.default }}/>
                  <div style={{ fontWeight:600, fontSize:12, marginBottom:3 }}>{s.name}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4 }}>{s.reason}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--primary)', marginTop:4 }}>{s.cal} kcal · {s.protein}g P</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hydration — compact ring row */}
      <div
        onClick={() => router.push('/water')}
        className="card press-effect fade-in-up"
        style={{ marginTop:14, padding:'16px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, animationDelay:'0.15s' }}
      >
        <div style={{ position:'relative', width:52, height:52, flexShrink:0 }}>
          <svg width="52" height="52" style={{ transform:'rotate(-90deg)', display:'block' }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--card2)" strokeWidth="5"/>
            <circle cx="26" cy="26" r="22" fill="none" stroke={waterMl>=waterGoal?'var(--green)':'var(--blue)'} strokeWidth="5"
              strokeLinecap="round" strokeDasharray={2*Math.PI*22} strokeDashoffset={2*Math.PI*22*(1-waterPct)}
              style={{ transition:'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)' }}/>
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <DropletIcon size={19} color={waterMl>=waterGoal?'var(--green)':'var(--blue)'}/>
          </div>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>Hydration</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
            <span style={{ fontWeight:700, color:waterMl>=waterGoal?'var(--green)':'var(--blue)' }}>{waterMl}ml</span> of {waterGoal}ml
          </div>
        </div>
        <div style={{ fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:99, background:waterMl>=waterGoal?'var(--green-bg)':'var(--blue-bg)', color:waterMl>=waterGoal?'var(--green)':'var(--blue)', display:'flex', alignItems:'center', gap:5, flexShrink:0, whiteSpace:'nowrap' }}>
          {waterMl>=waterGoal ? <><PartyIcon size={13}/> Done</> : `${waterGoal-waterMl}ml left`}
        </div>
      </div>

      <NextBestActionCard profile={profile} logs={logs} waterMl={waterMl} />

      {/* Quick actions — unified list card (Meal Planner / Insights / Supplements) */}
      <div className="card fade-in-up" style={{ marginTop:14, padding:'4px 0', animationDelay:'0.2s' }}>
        {quickActions.map((item, i) => (
          <button
            key={item.title}
            onClick={() => router.push(item.path)}
            className="qa-row press-effect"
            style={{
              width:'100%', display:'flex', alignItems:'center', gap:13, padding:'13px 18px',
              background:'none', border:'none', cursor:'pointer', textAlign:'left',
              borderBottom: i < quickActions.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ width:38, height:38, borderRadius:11, background:item.iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              {item.icon}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{item.title}</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>{item.sub}</div>
            </div>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>

      {/* Log food */}
      <button className="btn btn-primary pulse-primary fade-in-up"
        style={{ position:'fixed', left:0, right:0, bottom:'calc(env(safe-area-inset-bottom,0px) + 92px)', margin:'0 auto', width:'fit-content', minWidth:170, maxWidth:'calc(100% - 40px)', zIndex:998, fontSize:15, fontWeight:700, padding:'13px 24px', animationDelay:'0.25s', boxShadow:'var(--shadow-primary)', whiteSpace:'nowrap' }}
        onClick={() => router.push('/log')}>
        + Log food
      </button>

      {/* Food logs */}
      <div style={{ marginTop:28 }}>
        {logs.length === 0 ? (
          <div className="fade-in-up" style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)', animationDelay:'0.3s' }}>
            <div style={{ position:'relative', width:80, height:80, margin:'0 auto 16px' }}>
              <img src="https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=80&h=80&fit=crop" alt="food" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', opacity:0.5 }}/>
            </div>
            <p style={{ fontWeight:600, marginBottom:4 }}>Nothing logged yet</p>
            <p style={{ fontSize:13 }}>Tap "Log food" to start tracking</p>
          </div>
        ) : (
          mealGroups.map((meal, gi) => {
            const items = logs.filter(l => l.meal_type === meal)
            if (!items.length) return null
            const mealCal = items.reduce((s,l)=>s+l.cal,0)
            return (
              <div key={meal} className="fade-in-up" style={{ marginBottom:20, animationDelay:`${0.3 + gi*0.05}s` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {getMealIcon(meal)}
                    <p style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--muted)' }}>{meal}</p>
                  </div>
                  <span style={{ fontSize:12, fontWeight:600, color:mealColors[meal] }}>{Math.round(mealCal)} kcal</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {items.map(log => (
                    <div key={log.id} className="card slide-up" style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                      <img
                        src={getFoodImage(log.name)}
                        alt={log.name}
                        style={{ width:48, height:48, borderRadius:12, objectFit:'cover', flexShrink:0 }}
                        onError={e => { e.currentTarget.src = FOOD_IMAGES.default }}
                      />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{log.name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                          {log.qty}{log.unit} · {Math.round(log.protein)}g P · {Math.round(log.carb)}g C · {Math.round(log.fat)}g F
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:16, fontWeight:700 }}>{Math.round(log.cal)}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>kcal</div>
                      </div>
                      <button onClick={() => deleteLog(log.id)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4, fontSize:18, lineHeight:1, flexShrink:0 }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
      <BottomNav/>
    </div>
  )
}
