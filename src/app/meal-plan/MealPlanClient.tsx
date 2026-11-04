'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchMeteredAI } from '@/lib/client/metered-ai-fetch'
import BottomNav from '@/components/BottomNav'
import { SaladIcon, FoodIcon, SunriseIcon, SunIcon, MoonIcon, AppleIcon, WarningIcon, TimerIcon, PencilIcon, LightbulbIcon, CartIcon, DropletIcon } from '@/lib/icons'

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
    id:'lunch_pref', question:'Your ideal lunch is...', iconType:'sun',
    options:['Rice + Dal + Sabzi','Roti + Sabzi + Curd','Chicken / Paneer curry','Salad + Soup'],
    custom:true
  },
  {
    id:'dinner_pref', question:'For dinner you prefer...', iconType:'moon',
    options:['Light - soup/salad','Same as lunch','Protein-heavy meal','Roti + Vegetables'],
    custom:true
  },
  {
    id:'snack_pref', question:'Your go-to snacks are...', iconType:'apple',
    options:['Fruits / Nuts','Protein bar / Shake','Biscuits / Chips','Tea / Coffee + light snack'],
    custom:true
  },
  {
    id:'allergies', question:'Any foods to avoid?', iconType:'warning',
    options:['None - I eat everything','Lactose intolerant','Gluten-free','Nut allergy'],
    custom:true
  },
  {
    id:'cooking_time', question:'How much time for meal prep?', iconType:'timer',
    options:['Quick - under 15 min','Moderate - 15-30 min','I love cooking - 30+ min','Prefer ready-to-eat'],
    custom:false
  },
]

const MEAL_COLORS = { Breakfast:'var(--orange)', Lunch:'var(--green)', Snack:'var(--primary)', Dinner:'var(--blue)' }

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
  const [step, setStep]       = useState('quiz')
  const [quizStep, setQuizStep] = useState(0)
  const [answers, setAnswers]  = useState({})
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom]   = useState(false)
  const [plan, setPlan]        = useState(null)
  const [logging, setLogging]  = useState(null)
  const [loggedMeals, setLoggedMeals] = useState(new Set())

  useEffect(() => {
    async function load() {
      const { data:{ user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth'); return }
      const { data:prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (prof) setProfile(prof)
      const saved = localStorage.getItem('Kayven_mealplan_date')
      const savedPlan = localStorage.getItem('Kayven_mealplan')
      const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())
      if (saved===today && savedPlan) {
        try { setPlan(JSON.parse(savedPlan)); setStep('plan') } catch (e) { console.error(e) }
      }
    }
    load()
  }, [])

  function selectOption(val) {
    const q = QUIZ[quizStep]
    setAnswers(p => ({...p,[q.id]:val}))
    setShowCustom(false)
    setCustomInput('')
    setTimeout(() => {
      if (quizStep < QUIZ.length-1) setQuizStep(s => s+1)
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
User profile: Gender: ${profile.gender || 'not specified'}, Age: ${profile.age || 'adult'}, Goal: ${profile.goal || 'lose weight'}, Daily targets: ${profile.cal_target||1700} kcal, ${profile.protein_target||167}g protein, ${profile.carb_target||144}g carbs, ${profile.fat_target||60}g fat
User food preferences: Diet type: ${prefs.diet_type || 'non-vegetarian'}, Cuisine: ${prefs.cuisine || 'Indian'}, Breakfast: ${prefs.breakfast_pref || 'eggs'}, Lunch: ${prefs.lunch_pref || 'rice and dal'}, Dinner: ${prefs.dinner_pref || 'roti and vegetables'}, Snack: ${prefs.snack_pref || 'fruits and nuts'}, Foods to avoid: ${prefs.allergies || 'none'}, Cooking time: ${prefs.cooking_time || 'moderate'}
Create ONLY a JSON response with: summary, meals array (with type, time, items with name/qty/cal/protein/carb/fat/note, totals, tip), day_total_cal, day_total_protein, shopping_list, hydration_tip, pro_tip`
    try {
      const res = await fetchMeteredAI('/api/meal-plan', {
        targets:{ cal:profile.cal_target||1700, protein:profile.protein_target||167, carb:profile.carb_target||144, fat:profile.fat_target||60 }, profile, preferences:prefs, customPrompt:prompt
      })
      const data = await res.json()
      if (data.result) {
        setPlan(data.result)
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())
        localStorage.setItem('Kayven_mealplan_date', today)
        localStorage.setItem('Kayven_mealplan', JSON.stringify(data.result))
        setStep('plan')
      } else {
        setStep('quiz'); setQuizStep(0)
        alert(data.error === 'AI_USAGE_LIMIT_REACHED' ? data.message : 'Could not generate plan. Please try again.')
      }
    } catch (e) {
      console.error(e)
      setStep('quiz'); setQuizStep(0)
    }
  }

  async function logMeal(meal) {
    const { data:{ user } } = await supabase.auth.getUser(); if (!user) return
    setLogging(meal.type)
    const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())
    try {
      await Promise.all(meal.items.map(item =>
        supabase.from('food_logs').insert({
          user_id:user.id, logged_at:today,
          name:item.name, qty:parseFloat(item.qty)||100, unit:'g',
          cal:item.cal, protein:item.protein, carb:item.carb||0, fat:item.fat||0, fiber:0,
          meal_type:meal.type.toLowerCase()
        })
      ))
      setLoggedMeals(p => new Set([...p,meal.type]))
    } catch (e) {
      console.error(e)
    }
    setLogging(null)
  }

  const renderQuiz = () => {
    const q = QUIZ[quizStep]
    const progress = ((quizStep)/QUIZ.length)*100
    return (
      <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',display:'flex',flexDirection:'column', paddingTop:'calc(var(--sat) + 20px)', paddingBottom: 90}}>
        <div style={{height:3,background:'var(--border)'}}><div style={{height:'100%',background:'var(--primary)',width:progress+'%',transition:'width 0.3s ease',borderRadius:2}}/></div>
        <div style={{flex:1,padding:'calc(env(safe-area-inset-top,0px) + 20px) 20px 20px',display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:32}}>
            <div>
              <div style={{fontSize:12,color:'var(--muted)',fontWeight:600,marginBottom:4}}>Question {quizStep+1} of {QUIZ.length}</div>
              <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.02em'}}>Personalise my plan</h1>
            </div>
            {quizStep>0&&(
              <button onClick={() => {setQuizStep(s => s-1);setShowCustom(false)}} style={{background:'none',border:'none',color:'var(--primary)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Back
              </button>
            )}
          </div>
          <div style={{textAlign:'center',marginBottom:32}}>
            <div style={{fontSize:56,marginBottom:16}}>{getQuizIcon(q.iconType)}</div>
            <div style={{fontSize:20,fontWeight:700,lineHeight:1.4,color:'var(--text)'}}>{q.question}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10,flex:1}}>
            {q.options.map((opt,i) => (
              <button key={i} onClick={() => selectOption(opt)} style={{padding:'16px 20px',borderRadius:16,border:'2px solid '+(answers[q.id]===opt?'var(--primary)':'var(--border)'),background:answers[q.id]===opt?'var(--primary-bg)':'var(--card)',cursor:'pointer',textAlign:'left',fontSize:15,fontWeight:500,color:answers[q.id]===opt?'var(--primary)':'var(--text)',display:'flex',alignItems:'center',gap:12,transition:'all 0.15s',WebkitTapHighlightColor:'transparent'}}>
                <div style={{width:28,height:28,borderRadius:'50%',border:'2px solid '+(answers[q.id]===opt?'var(--primary)':'var(--border)'),background:answers[q.id]===opt?'var(--primary)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {answers[q.id]===opt&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary-contrast)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                {opt}
              </button>
            ))}
            {q.custom&&(
              showCustom?(
                <div style={{display:'flex',gap:8}}>
                  <input type="text" placeholder="Type your preference..." value={customInput} onChange={e => setCustomInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&submitCustom()} style={{flex:1,borderRadius:14}} autoFocus/>
                  <button onClick={submitCustom} style={{padding:'12px 18px',borderRadius:14,background:'var(--primary)',border:'none',color:'var(--primary-contrast)',fontWeight:700,cursor:'pointer',flexShrink:0,WebkitTapHighlightColor:'transparent'}}>OK</button>
                </div>
              ):(
                <button onClick={() => setShowCustom(true)} style={{padding:'14px 20px',borderRadius:16,border:'2px dashed var(--border)',background:'transparent',cursor:'pointer',textAlign:'left',fontSize:14,fontWeight:500,color:'var(--muted)',WebkitTapHighlightColor:'transparent'}}>Edit - type your own</button>
              )
            )}
          </div>
          {quizStep>=2&&(
            <button onClick={() => generatePlan(answers)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:12,cursor:'pointer',marginTop:16,textAlign:'center',textDecoration:'underline'}}>Skip quiz - generate now</button>
          )}
        </div>
      </div>
    )
  }

  const renderLoading = () => (
    <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px',paddingTop:'calc(var(--sat) + 40px)',textAlign:'center', paddingBottom: 90}}>
      <div style={{fontSize:64,marginBottom:24}}>Meal</div>
      <div style={{fontWeight:700,fontSize:20,marginBottom:8}}>Building your plan</div>
      <div style={{fontSize:14,color:'var(--muted)',marginBottom:32,lineHeight:1.7}}>AI is crafting a personalised meal plan based on your preferences and targets</div>
      <div style={{display:'flex',gap:6}}>{[0,1,2].map(i => <div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--primary)',opacity:0.6,animation:'pulse 1.5s infinite',animationDelay:i*0.2+'s'}}/>)}</div>
    </div>
  )

  const renderPlan = () => {
    if (!plan) return null
    return (
      <div style={{background:'var(--surface)',minHeight:'100dvh',maxWidth:430,margin:'0 auto',display:'flex',flexDirection:'column', paddingTop:'calc(var(--sat) + 20px)', paddingBottom: 90}}>
        <div style={{padding:'20px'}}>
          <h1 style={{fontSize:22,fontWeight:700,marginBottom:6}}>Your meal plan</h1>
          <p style={{fontSize:13,color:'var(--muted)',marginBottom:20}}>{plan.summary}</p>
          <div style={{background:'linear-gradient(135deg,var(--green),var(--green))',borderRadius:20,padding:'18px 20px',marginBottom:16,color:'var(--primary-contrast)'}}>
            <div style={{fontSize:12,opacity:0.85,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:12}}>Today targets</div>
            <div style={{display:'flex',gap:20}}>
              {[{l:'Calories',v:plan.day_total_cal,u:'kcal'},{l:'Protein',v:plan.day_total_protein,u:'g'}].map(s => (
                <div key={s.l}>
                  <div style={{fontSize:28,fontWeight:800}}>{s.v}<span style={{fontSize:14,fontWeight:400,opacity:0.8}}> {s.u}</span></div>
                  <div style={{fontSize:11,opacity:0.75}}>{s.l}</div>
                </div>
              ))}
            </div>
            {plan.pro_tip&&<div style={{marginTop:14,background:'rgba(255,255,255,0.15)',borderRadius:10,padding:'10px 12px',fontSize:12,lineHeight:1.6}}>[bulb] {plan.pro_tip}</div>}
          </div>
          {plan.meals?.map((meal,i) => {
            const color  = MEAL_COLORS[meal.type]||'var(--primary)'
            const icon   = getMealIcon(meal.type)
            const logged = loggedMeals.has(meal.type)
            return (
              <div key={i} className="card" style={{marginBottom:14,borderLeft:'4px solid '+color}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:42,height:42,borderRadius:12,background:`color-mix(in srgb, ${color} 10%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{icon}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color}}>{meal.type}</div>
                      <div style={{fontSize:11,color:'var(--muted)'}}>{meal.time}</div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:800,fontSize:16,color}}>{meal.total_cal} kcal</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{meal.total_protein}g P · {meal.total_carb}g C · {meal.total_fat}g F</div>
                  </div>
                </div>
                {meal.items?.map((item,j) => (
                  <div key={j} style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'10px 0',borderBottom:j<meal.items.length-1?'1px solid var(--border)':'none'}}>
                    <div style={{flex:1,paddingRight:8}}>
                      <div style={{fontWeight:600,fontSize:13}}>{item.name}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{item.qty} · {item.protein}g P · {item.carb}g C · {item.fat}g F</div>
                      {item.note&&<div style={{fontSize:11,color:'var(--primary)',marginTop:3,fontStyle:'italic'}}>{item.note}</div>}
                    </div>
                    <div style={{fontWeight:700,fontSize:13,color:'var(--muted)',flexShrink:0}}>{item.cal} kcal</div>
                  </div>
                ))}
                {meal.tip&&<div style={{marginTop:12,padding:'10px 12px',background:`color-mix(in srgb, ${color} 8%, transparent)`,borderRadius:10,fontSize:12,color:color,fontWeight:500}}>[bulb] {meal.tip}</div>}
                <button onClick={() => !logged&&logMeal(meal)} disabled={logging===meal.type||logged} style={{width:'100%',marginTop:14,padding:'12px',borderRadius:12,background:logged?'var(--green-bg)':color,color:logged?'var(--green)':'var(--colored-label)',border:logged?'1.5px solid var(--green)':'none',fontWeight:700,fontSize:13,cursor:logged?'default':'pointer',transition:'all 0.2s',WebkitTapHighlightColor:'transparent'}}>
                  {logging===meal.type?'Logging...':logged?'[done] Logged':'+ Log this meal'}
                </button>
              </div>
            )
          })}
          {plan.shopping_list?.length>0&&(
            <div className="card" style={{marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>[cart] Shopping list</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {plan.shopping_list.map((item,i) => (
                  <div key={i} style={{padding:'6px 12px',background:'var(--card2)',borderRadius:99,fontSize:12,fontWeight:500,border:'1.5px solid var(--border)'}}>{item}</div>
                ))}
              </div>
            </div>
          )}
          {plan.hydration_tip&&(
            <div style={{background:'var(--blue-bg)',borderRadius:16,padding:'14px 16px',border:'1.5px solid var(--blue)',marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:13,color:'var(--blue)',marginBottom:4,display:'flex',alignItems:'center',gap:6}}><DropletIcon size={16} color='var(--blue)'/>Hydration tip</div>
              <div style={{fontSize:13,color:'var(--blue)',lineHeight:1.6}}>{plan.hydration_tip}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {step === 'quiz' && renderQuiz()}
      {step === 'loading' && renderLoading()}
      {step === 'plan' && plan && renderPlan()}
      <BottomNav/>
    </>
  )
}
