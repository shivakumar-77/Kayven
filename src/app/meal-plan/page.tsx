'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchMeteredAI } from '@/lib/client/metered-ai-fetch'
import BottomNav from '@/components/BottomNav'
import { SaladIcon, FoodIcon, SunriseIcon, SunIcon, MoonIcon, AppleIcon, WarningIcon, TimerIcon, PencilIcon, LightbulbIcon, CartIcon } from '@/lib/icons'

const QUIZ = [
  {
    id:'diet_type', question:'What best describes your diet?', iconType:'salad',
    options:['Vegetarian','Non-vegetarian','Vegan','Eggetarian'],
    custom:true
  },
  {
    id:'cuisine', question:'What cuisine do you prefer?', iconType:'food',
    options:['Indian (North)','Indian (South)','Mixed / Both','Continental'],
    custom:true
  },
  {
    id:'breakfast_pref', question:'What do you usually eat for breakfast?', iconType:'sunrise',
    options:['Eggs & protein','Idli / Dosa / Upma','Oats / Cereal','Paratha / Roti'],
    custom:true
  },
  {
    id:'lunch_pref', question:'Your ideal lunch is…', iconType:'sun',
    options:['Rice + Dal + Sabzi','Roti + Sabzi + Curd','Chicken / Paneer curry','Salad + Soup'],
    custom:true
  },
  {
    id:'dinner_pref', question:'For dinner you prefer…', iconType:'moon',
    options:['Light — soup / salad','Same as lunch','Protein-heavy meal','Roti + Vegetables'],
    custom:true
  },
  {
    id:'snack_pref', question:'Your go-to snacks are…', iconType:'apple',
    options:['Fruits / Nuts','Protein bar / Shake','Biscuits / Chips','Tea / Coffee + light snack'],
    custom:true
  },
  {
    id:'allergies', question:'Any foods to avoid?', iconType:'warning',
    options:['None — I eat everything','Lactose intolerant','Gluten-free','Nut allergy'],
    custom:true
  },
  {
    id:'cooking_time', question:'How much time for meal prep?', iconType:'timer',
    options:['Quick — under 15 min','Moderate — 15-30 min','I love cooking — 30+ min','Prefer ready-to-eat'],
    custom:false
  },
  {
    id:'budget', question:'What is your food budget preference?', iconType:'food',
    options:['Budget-friendly','Moderate','Flexible','Use what I already have'],
    custom:true
  },
  {
    id:'plan_focus', question:'What should this plan focus on?', iconType:'salad',
    options:['High protein','High fiber','Simple meals','Meal prep friendly','Weight-loss focused','Muscle-building focused','Balanced nutrition'],
    custom:true
  },
]

const PLAN_STORAGE_KEY = 'Kayven_mealplan_v2'
const PLAN_DATE_STORAGE_KEY = 'Kayven_mealplan_v2_date'

const MEAL_COLORS = { Breakfast:'#f59e0b', Lunch:'#10b981', Snack:'#6366f1', Dinner:'#3b82f6' }

const getQuizIcon = (type) => {
  const icons = {
    salad: <SaladIcon size={24}/>,
    food: <FoodIcon size={24}/>,
    sunrise: <SunriseIcon size={24}/>,
    sun: <SunIcon size={24}/>,
    moon: <MoonIcon size={24}/>,
    apple: <AppleIcon size={24}/>,
    warning: <WarningIcon size={24}/>,
    timer: <TimerIcon size={24}/>,
  }
  return icons[type]
}

const getMealIcon = (meal) => {
  const icons = { Breakfast:<SunriseIcon size={18}/>, Lunch:<SunIcon size={18}/>, Snack:<AppleIcon size={18}/>, Dinner:<MoonIcon size={18}/> }
  return icons[meal]
}

export default function MealPlanPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [step, setStep]       = useState('quiz') // quiz | loading | plan
  const [quizStep, setQuizStep] = useState(0)
  const [answers, setAnswers]  = useState({})
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom]   = useState(false)
  const [plan, setPlan]        = useState(null)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [logging, setLogging]  = useState(null)
  const [loggedMeals, setLoggedMeals] = useState(new Set())

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth'); return }
      const { data:prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (prof) setProfile(prof)

      // Check saved plan from today
      const saved = localStorage.getItem(PLAN_DATE_STORAGE_KEY)
      const savedPlan = localStorage.getItem(PLAN_STORAGE_KEY)
      const today = new Date().toISOString().slice(0,10)
      if (saved===today && savedPlan) {
        try {
          const parsed = JSON.parse(savedPlan)
          if (parsed.meals?.length && parsed.meals.every(meal => Array.isArray(meal.options) && meal.options.length === 4)) {
            setPlan(parsed); setStep('plan')
          }
        } catch {}
      }
    }
    load()
  }, [])

  function selectOption(val) {
    const q = QUIZ[quizStep]
    setAnswers(p=>({...p,[q.id]:val}))
    setShowCustom(false)
    setCustomInput('')
    setTimeout(()=>{
      if (quizStep < QUIZ.length-1) setQuizStep(s=>s+1)
      else generatePlan({...answers,[q.id]:val})
    }, 200)
  }

  function submitCustom() {
    if (!customInput.trim()) return
    selectOption(customInput.trim())
  }

  async function generatePlan(finalAnswers) {
    setStep('loading')
    if (!profile) return

    const prefs = finalAnswers || answers

    const prompt = `Create a detailed, personalized full-day Indian meal plan.

User profile:
- Gender: ${profile.gender || 'not specified'}
- Age: ${profile.age || 'adult'}
- Goal: ${profile.goal || 'lose weight'}
- Daily targets: ${profile.cal_target||1700} kcal, ${profile.protein_target||167}g protein, ${profile.carb_target||144}g carbs, ${profile.fat_target||60}g fat

User food preferences (from quiz):
- Diet type: ${prefs.diet_type || 'non-vegetarian'}
- Cuisine: ${prefs.cuisine || 'Indian'}
- Breakfast preference: ${prefs.breakfast_pref || 'eggs'}
- Lunch preference: ${prefs.lunch_pref || 'rice and dal'}
- Dinner preference: ${prefs.dinner_pref || 'roti and vegetables'}
- Snack preference: ${prefs.snack_pref || 'fruits and nuts'}
- Foods to avoid: ${prefs.allergies || 'none'}
- Cooking time: ${prefs.cooking_time || 'moderate'}
- Budget: ${prefs.budget || 'moderate'}
- Plan focus: ${prefs.plan_focus || 'balanced nutrition'}

Create ONLY a JSON response matching this exact structure:
Return exactly four genuinely different options for each of Breakfast, Lunch, Snack, and Dinner. Never return fewer or duplicate variations.
{
  "summary": "One sentence about this plan",
  "meals": [
    {
      "type": "Breakfast",
      "time": "7:00 - 9:00 AM",
      "emoji": "SunriseIcon",
      "options": [
        {
          "name": "genuinely different meal option",
          "ingredients": [{"name":"Oats","quantity":"60 g"}],
          "nutrition": {"calories":400,"protein":25,"carbs":45,"fat":12,"fiber":8},
          "recipe": ["Add ingredients to a pan.","Cook until ready.","Serve."],
          "tip": "one helpful practical tip"
        }
      ]
    },
    { "type": "Lunch", ... },
    { "type": "Snack", ... },
    { "type": "Dinner", ... }
  ],
  "day_total_cal": 1700,
  "day_total_protein": 167,
  "day_total_carbs": 144,
  "day_total_fat": 60,
  "day_total_fiber": 25,
  "shopping_list": ["item1", "item2"],
  "hydration_tip": "specific water advice",
  "pro_tip": "one important nutrition tip for this person's goal"
}`

    try {
      const res = await fetchMeteredAI('/api/meal-plan', {
        targets:{ cal:profile.cal_target||1700, protein:profile.protein_target||167, carb:profile.carb_target||144, fat:profile.fat_target||60 }, profile, preferences:prefs, customPrompt:prompt
      })
      const data = await res.json()
      if (data.result) {
        setPlan(data.result)
        const today = new Date().toISOString().slice(0,10)
        localStorage.setItem(PLAN_DATE_STORAGE_KEY, today)
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data.result))
        setStep('plan')
      } else {
        setStep('quiz'); setQuizStep(0)
        alert(data?.error === 'AI_USAGE_LIMIT_REACHED' ? data.message : 'Could not generate plan. Please try again.')
      }
    } catch {
      setStep('quiz'); setQuizStep(0)
    }
  }

  async function logMeal(meal, option) {
    const { data:{ user } } = await supabase.auth.getUser(); if (!user) return
    setLogging(meal.type)
    const today = new Date().toISOString().slice(0,10)
    const items = option?.ingredients || option?.items || []
    await Promise.all(items.map(item =>
      supabase.from('food_logs').insert({
        user_id:user.id, logged_at:today,
        name:item.name, qty:parseFloat(String(item.quantity || item.qty || '').replace(/[^0-9.]/g,''))||100, unit:'g',
        cal:item.cal ?? item.nutrition?.calories ?? 0, protein:item.protein ?? item.nutrition?.protein ?? 0, carb:item.carb ?? item.nutrition?.carbs ?? 0, fat:item.fat ?? item.nutrition?.fat ?? 0, fiber:item.fiber ?? item.nutrition?.fiber ?? 0,
        meal_type:meal.type.toLowerCase()
      })
    ))
    setLoggedMeals(p=>new Set([...p,meal.type]))
    setLogging(null)
  }

  // ── QUIZ ──
  if (step==='quiz') {
    const q = QUIZ[quizStep]
    const progress = ((quizStep)/QUIZ.length)*100

    return (
      <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',display:'flex',flexDirection:'column'}}>
        {/* Progress bar */}
        <div style={{height:3,background:'var(--border)'}}>
          <div style={{height:'100%',background:'var(--primary)',width:progress+'%',transition:'width 0.3s ease',borderRadius:2}}/>
        </div>

        <div style={{flex:1,padding:'calc(env(safe-area-inset-top,0px) + 20px) 20px 20px',display:'flex',flexDirection:'column'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:32}}>
            <div>
              <div style={{fontSize:12,color:'var(--muted)',fontWeight:600,marginBottom:4}}>
                Question {quizStep+1} of {QUIZ.length}
              </div>
              <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.02em'}}>Personalise my plan</h1>
            </div>
            {quizStep>0&&(
              <button onClick={()=>{setQuizStep(s=>s-1);setShowCustom(false)}}
                style={{background:'none',border:'none',color:'var(--primary)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                ← Back
              </button>
            )}
          </div>

          {/* Question */}
          <div style={{textAlign:'center',marginBottom:32}}>
            <div style={{fontSize:56,marginBottom:16}}>{getQuizIcon(q.iconType)}</div>
            <div style={{fontSize:20,fontWeight:700,lineHeight:1.4,color:'var(--text)'}}>{q.question}</div>
          </div>

          {/* Options */}
          <div style={{display:'flex',flexDirection:'column',gap:10,flex:1}}>
            {q.options.map((opt,i)=>(
              <button key={i} onClick={()=>selectOption(opt)}
                style={{padding:'16px 20px',borderRadius:16,border:'2px solid '+(answers[q.id]===opt?'var(--primary)':'var(--border)'),background:answers[q.id]===opt?'var(--primary-bg)':'var(--card)',cursor:'pointer',textAlign:'left',fontSize:15,fontWeight:500,color:answers[q.id]===opt?'var(--primary)':'var(--text)',display:'flex',alignItems:'center',gap:12,transition:'all 0.15s',WebkitTapHighlightColor:'transparent'}}>
                <div style={{width:28,height:28,borderRadius:'50%',border:'2px solid '+(answers[q.id]===opt?'var(--primary)':'var(--border)'),background:answers[q.id]===opt?'var(--primary)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {answers[q.id]===opt&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                {opt}
              </button>
            ))}

            {/* Something else option */}
            {q.custom&&(
              showCustom?(
                <div style={{display:'flex',gap:8}}>
                  <input type="text" placeholder="Type your preference…" value={customInput}
                    onChange={e=>setCustomInput(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&submitCustom()}
                    style={{flex:1,borderRadius:14}}
                    autoFocus/>
                  <button onClick={submitCustom}
                    style={{padding:'12px 18px',borderRadius:14,background:'var(--primary)',border:'none',color:'#fff',fontWeight:700,cursor:'pointer',flexShrink:0,WebkitTapHighlightColor:'transparent'}}>
                    →
                  </button>
                </div>
              ):(
                <button onClick={()=>setShowCustom(true)}
                  style={{padding:'14px 20px',borderRadius:16,border:'2px dashed var(--border)',background:'transparent',cursor:'pointer',textAlign:'left',fontSize:14,fontWeight:500,color:'var(--muted)',WebkitTapHighlightColor:'transparent'}}>
                  ✏️ Something else — type your own
                </button>
              )
            )}
          </div>

          {/* Skip to generate */}
          {quizStep>=2&&(
            <button onClick={()=>generatePlan(answers)}
              style={{background:'none',border:'none',color:'var(--muted)',fontSize:12,cursor:'pointer',marginTop:16,textAlign:'center',textDecoration:'underline'}}>
              Skip quiz — generate now
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── LOADING ──
  if (step==='loading') return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px',textAlign:'center'}}>
      <div style={{fontSize:64,marginBottom:24}}>🍽️</div>
      <div style={{fontWeight:700,fontSize:20,marginBottom:8}}>Building your plan…</div>
      <div style={{fontSize:14,color:'var(--muted)',marginBottom:32,lineHeight:1.7}}>
        Matching your goal, nutrition targets, food preferences, cooking time, and diet
      </div>
      <div style={{display:'flex',gap:8}}>
        {[0,1,2].map(i=>(
          <div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--primary)',animation:'bounce 1.2s infinite',animationDelay:i*0.2+'s',opacity:0.6}}/>
        ))}
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.8);opacity:0.4}40%{transform:scale(1.2);opacity:1}}`}</style>
    </div>
  )

  // ── PLAN ──
  if (step==='plan'&&plan) return (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',paddingBottom:100}}>
      <div style={{padding:'calc(env(safe-area-inset-top,0px) + 20px) 20px 0'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.02em'}}>Your Meal Plan</h1>
          <button onClick={()=>{setPlan(null);setStep('quiz');setQuizStep(0);setAnswers({});setSelectedOptions({});setLoggedMeals(new Set());localStorage.removeItem(PLAN_STORAGE_KEY);localStorage.removeItem(PLAN_DATE_STORAGE_KEY)}}
            style={{background:'var(--card2)',border:'1.5px solid var(--border)',borderRadius:10,padding:'7px 12px',color:'var(--muted)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            Redo quiz
          </button>
        </div>
        <p style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>{plan.summary}</p>

        {/* Day totals */}
        <div style={{background:'linear-gradient(135deg,#10b981,#059669)',borderRadius:20,padding:'18px 20px',marginBottom:16,color:'#fff'}}>
          <div style={{fontSize:12,opacity:0.85,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:12}}>Today's targets</div>
          <div style={{display:'flex',gap:20}}>
            {[{l:'Calories',v:plan.day_total_cal,u:'kcal'},{l:'Protein',v:plan.day_total_protein,u:'g'},{l:'Carbs',v:plan.day_total_carbs,u:'g'},{l:'Fat',v:plan.day_total_fat,u:'g'},{l:'Fiber',v:plan.day_total_fiber,u:'g'}].map(s=>(
              <div key={s.l}>
                <div style={{fontSize:28,fontWeight:800}}>{s.v}<span style={{fontSize:14,fontWeight:400,opacity:0.8}}> {s.u}</span></div>
                <div style={{fontSize:11,opacity:0.75}}>{s.l}</div>
              </div>
            ))}
          </div>
          {plan.pro_tip&&(
            <div style={{marginTop:14,background:'rgba(255,255,255,0.15)',borderRadius:10,padding:'10px 12px',fontSize:12,lineHeight:1.6}}>
              💡 {plan.pro_tip}
            </div>
          )}
        </div>

        {/* Meal cards with one expanded option at a time */}
        {plan.meals?.map((meal,i)=>{
          const color  = MEAL_COLORS[meal.type]||'#6366f1'
          const icon   = getMealIcon(meal.type)
          const options = Array.isArray(meal.options) ? meal.options.slice(0,4) : []
          const selected = Math.min(selectedOptions[meal.type] || 0, Math.max(options.length - 1, 0))
          const option = options[selected]
          const nutrition = option?.nutrition || {}
          const logged = loggedMeals.has(meal.type)
          if (options.length !== 4) return null
          return (
            <div key={i} className="card" style={{marginBottom:14,borderLeft:'4px solid '+color}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:42,height:42,borderRadius:12,background:color+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{icon}</div>
                  <div><div style={{fontWeight:700,fontSize:15,color}}>{meal.type}</div><div style={{fontSize:11,color:'var(--muted)'}}>{meal.time}</div></div>
                </div>
                <div style={{textAlign:'right'}}><div style={{fontWeight:800,fontSize:16,color}}>{nutrition.calories || 0} kcal</div><div style={{fontSize:11,color:'var(--muted)'}}>{nutrition.protein || 0}g P · {nutrition.carbs || 0}g C · {nutrition.fat || 0}g F · {nutrition.fiber || 0}g fiber</div></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5,marginBottom:14}}>
                {options.map((candidate,j)=><button key={j} onClick={()=>setSelectedOptions(p=>({...p,[meal.type]:j}))} style={{padding:'8px 4px',borderRadius:9,border:'1px solid '+(selected===j?color:'var(--border)'),background:selected===j?color+'18':'var(--card2)',color:selected===j?color:'var(--muted)',fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Option {j+1}</button>)}
              </div>
              <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>{option.name}</div>
              {option.ingredients?.map((ingredient,j)=><div key={j} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:j<option.ingredients.length-1?'1px solid var(--border)':'none',fontSize:12}}><span>{ingredient.name}</span><strong>{ingredient.quantity}</strong></div>)}
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4,marginTop:12,padding:'10px 6px',background:'var(--card2)',borderRadius:10,textAlign:'center'}}>
                {[['Calories',nutrition.calories,'kcal'],['Protein',nutrition.protein,'g'],['Carbs',nutrition.carbs,'g'],['Fat',nutrition.fat,'g'],['Fiber',nutrition.fiber,'g']].map(([label,value,unit])=><div key={label}><div style={{fontWeight:700,fontSize:12}}>{value || 0}{unit==='kcal'?'':'g'}</div><div style={{fontSize:9,color:'var(--muted)',marginTop:2}}>{label}</div></div>)}
              </div>
              {option.recipe?.length>0&&<div style={{marginTop:12}}><div style={{fontWeight:700,fontSize:12,marginBottom:5}}>How to make</div><ol style={{paddingLeft:20,margin:0,color:'var(--text-2)',fontSize:12,lineHeight:1.6}}>{option.recipe.map((step,j)=><li key={j}>{step}</li>)}</ol></div>}
              {option.tip&&<div style={{marginTop:12,padding:'10px 12px',background:color+'12',borderRadius:10,fontSize:12,color:color,fontWeight:500}}>Tip: {option.tip}</div>}
              <button onClick={()=>!logged&&logMeal(meal,option)} disabled={logging===meal.type||logged} style={{width:'100%',marginTop:14,padding:'12px',borderRadius:12,background:logged?'#d1fae5':color,color:logged?'#059669':'#fff',border:logged?'1.5px solid #6ee7b7':'none',fontWeight:700,fontSize:13,cursor:logged?'default':'pointer',transition:'all 0.2s',WebkitTapHighlightColor:'transparent'}}>{logging===meal.type?'Logging…':logged?'✓ Logged':'+ Log this meal'}</button>
            </div>
          )
        })}

        {/* Shopping list */}
        {plan.shopping_list?.length>0&&(
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>🛒 Shopping list</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {plan.shopping_list.map((item,i)=>(
                <div key={i} style={{padding:'6px 12px',background:'var(--card2)',borderRadius:99,fontSize:12,fontWeight:500,border:'1.5px solid var(--border)'}}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hydration */}
        {plan.hydration_tip&&(
          <div style={{background:'#dbeafe',borderRadius:16,padding:'14px 16px',border:'1.5px solid #93c5fd',marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:13,color:'#2563eb',marginBottom:4}}>💧 Hydration tip</div>
            <div style={{fontSize:13,color:'#1d4ed8',lineHeight:1.6}}>{plan.hydration_tip}</div>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  )

  return null
}
