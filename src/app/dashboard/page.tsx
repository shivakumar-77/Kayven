import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MealPlanClient } from './MealPlanClient'
import { WaterTracker } from '@/components/WaterTracker'
import { FireIcon, DropletIcon, TargetIcon, BoltIcon, ChartBarIcon, MealPlanIcon, AIIcon, ScaleIcon, CheckIcon, MuscleIcon, WarningIcon, TrophyIcon, SunriseIcon, SunIcon, MoonIcon, AppleIcon, FoodIcon, PartyIcon, SupplementIcon, RobotIcon, WaveIcon } from '@/lib/icons'

export default function Dashboard() {
  const [profile, setProfile] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [memories, setMemories] = useState([])
  const [recentMeals, setRecentMeals] = useState([])
  const [weightEntries, setWeightEntries] = useState([])
  const [workoutSessions, setWorkoutSessions] = useState([])
  const [waterLogs, setWaterLogs] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    try {
      // Get user session first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No authenticated user')

      // Run all Supabase queries in parallel
      const [
        profileResult,
        subscriptionResult,
        memoriesResult,
        recentMealsResult,
        weightEntriesResult,
        workoutSessionsResult,
        waterLogsResult
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single(),

        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .single(),

        supabase
          .from('memories')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('meal_tracking')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(7),

        supabase
          .from('weight_tracking')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(7),

        supabase
          .from('workout_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(7),

        supabase
          .from('water_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(7)
      ])

      // Handle profile result
      if (profileResult.error || !profileResult.data) {
        throw new Error('Failed to load profile')
      }
      setProfile(profileResult.data)

      // Handle subscription result
      if (subscriptionResult.error) {
        console.warn('Failed to load subscription:', subscriptionResult.error)
        setSubscription(null)
      } else {
        setSubscription(subscriptionResult.data)
      }

      // Handle memories result
      if (memoriesResult.error) {
        console.warn('Failed to load memories:', memoriesResult.error)
        setMemories([])
      } else {
        setMemories(memoriesResult.data || [])
      }

      // Handle recent meals result
      if (recentMealsResult.error) {
        console.warn('Failed to load recent meals:', recentMealsResult.error)
        setRecentMeals([])
      } else {
        setRecentMeals(recentMealsResult.data || [])
      }

      // Handle weight entries result
      if (weightEntriesResult.error) {
        console.warn('Failed to load weight entries:', weightEntriesResult.error)
        setWeightEntries([])
      } else {
        setWeightEntries(weightEntriesResult.data || [])
      }

      // Handle workout sessions result
      if (workoutSessionsResult.error) {
        console.warn('Failed to load workout sessions:', workoutSessionsResult.error)
        setWorkoutSessions([])
      } else {
        setWorkoutSessions(workoutSessionsResult.data || [])
      }

      // Handle water logs result
      if (waterLogsResult.error) {
        console.warn('Failed to load water logs:', waterLogsResult.error)
        setWaterLogs([])
      } else {
        setWaterLogs(waterLogsResult.data || [])
      }

      // Fetch AI suggestions after we have the data
      try {
        // Calculate totals for the suggestion request
        const totals = {
          cal: recentMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0),
          protein: recentMeals.reduce((sum, meal) => sum + (meal.protein || 0), 0),
          carb: recentMeals.reduce((sum, meal) => sum + (meal.carbs || 0), 0),
          fat: recentMeals.reduce((sum, meal) => sum + (meal.fat || 0), 0)
        }

        const targets = profile?.goals || { cal: 2000, protein: 100, carb: 250, fat: 70 }

        const suggestionsResponse = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ totals, targets, logs: recentMeals })
        })

        if (suggestionsResponse.ok) {
          const suggestionsData = await suggestionsResponse.json()
          setSuggestions(suggestionsData.result?.suggestions || [])
        } else {
          console.error('Failed to fetch suggestions:', suggestionsResponse.status)
          setSuggestions([])
        }
      } catch (error) {
        console.error('Failed to fetch suggestions:', error)
        setSuggestions([])
      }
    } catch (error) {
      console.error('Error in load:', error)
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-content">
        <div className="animate-pulse">
          <div className="w-16 h-16 rounded-xl bg-card2"></div>
          <div className="mt-4 w-20 h-4 rounded-lg bg-card2"></div>
          <div className="mt-2 w-24 h-4 rounded-lg bg-card2"></div>
          <div className="mt-2 w-28 h-4 rounded-lg bg-card2"></div>
          <div className="mt-4 w-36 h-4 rounded-lg bg-card2"></div>
          <div className="mt-2 w-32 h-4 rounded-lg bg-card2"></div>
          <div className="mt-2 w-28 h-4 rounded-lg bg-card2"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-red mb-4">Error Loading Dashboard</h2>
        <p className="text-muted">{error}</p>
        <button
          onClick={() => load()}
          className="btn btn-primary mt-4"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-primary mb-4">Welcome!</h2>
        <p className="text-muted">Loading your profile...</p>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">
          Welcome back, {profile.name.split(' ')[0] || 'there'}!
        </h1>
        <div className="flex items-center gap-2">
          {subscription?.plan_name && (
            <span className="badge badge-primary">
              {subscription.plan_name} • {new Date(subscription.current_period_end * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        {/* Calories */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FireIcon className="w-5 h-5 text-primary" />
              <span className="font-medium">Calories</span>
            </div>
            <Badge
              value={recentMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0)}
              target={profile?.goals?.cal || 2000}
            />
          </div>
          <div className="text-2xl font-bold">
            {recentMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0)} / {profile?.goals?.cal || 2000} kcal
          </div>
          <div className="mt-2">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: Math.min(100, (recentMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0) / (profile?.goals?.cal || 2000)) * 100) + '%' }}
              ></div>
            </div>
          </div>
        </div>

        {/* Protein */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MuscleIcon className="w-5 h-5 text-primary" />
              <span className="font-medium">Protein</span>
            </div>
            <Badge
              value={recentMeals.reduce((sum, meal) => sum + (meal.protein || 0), 0)}
              target={profile?.goals?.protein || 100}
            />
          </div>
          <div className="text-2xl font-bold">
            {recentMeals.reduce((sum, meal) => sum + (meal.protein || 0), 0)} / {profile?.goals?.protein || 100}g
          </div>
          <div className="mt-2">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: Math.min(100, (recentMeals.reduce((sum, meal) => sum + (meal.protein || 0), 0) / (profile?.goals?.protein || 100)) * 100) + '%' }}
              ></div>
            </div>
          </div>
        </div>

        {/* Water */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DropletIcon className="w-5 h-5 text-primary" />
              <span className="font-medium">Water</span>
            </div>
            <Badge
              value={waterLogs.reduce((sum, log) => sum + (log.amount_oz || 0), 0)}
              target={profile?.water_goal || 64}
            />
          </div>
          <div className="text-2xl font-bold">
            {waterLogs.reduce((sum, log) => sum + (log.amount_oz || 0), 0)} / {profile?.water_goal || 64} oz
          </div>
          <div className="mt-2">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: Math.min(100, (waterLogs.reduce((sum, log) => sum + (log.amount_oz || 0), 0) / (profile?.water_goal || 64)) * 100) + '%' }}
              ></div>
            </div>
          </div>
        </div>

        {/* Weight */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ScaleIcon className="w-5 h-5 text-primary" />
              <span className="font-medium">Weight</span>
            </div>
            {weightEntries.length > 0 ? (
              <span className="text-xs text-muted">
                {weightEntries[0]?.weight || 0} lbs
              </span>
            ) : (
              <span className="text-xs text-muted">No data</span>
            )}
          </div>
          <div className="text-2xl font-bold">
            {weightEntries.length > 0 ? weightEntries[0]?.weight || 0 : '--'} lbs
          </div>
          {weightEntries.length >= 2 && (
            <div className="mt-2 text-xs">
              {weightEntries[0]?.weight - weightEntries[1]?.weight >= 0 ? '+' : ''}
              {(weightEntries[0]?.weight || 0) - (weightEntries[1]?.weight || 0)} lbs from last
            </div>
          )}
        </div>

        {/* Workouts */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BoltIcon className="w-5 h-5 text-primary" />
              <span className="font-medium">Workouts</span>
            </div>
            <span className="text-xs text-muted">{workoutSessions.length} this week</span>
          </div>
          <div className="text-2xl font-bold">{workoutSessions.length}</div>
          <div className="mt-2 text-xs">
            {workoutSessions.reduce((sum, session) => sum + (session.duration || 0), 0)} minutes total
          </div>
        </div>
      </div>

      {/* Recent Meals */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Recent Meals</h2>
        {recentMeals.length === 0 ? (
          <p className="text-muted text-center py-8">No meals logged yet. Start tracking your nutrition!</p>
        ) : (
          <div className="space-y-3">
            {recentMeals.slice(0, 3).map((meal, index) => (
              <div key={index} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FoodIcon className="w-4 h-4 text-primary" />
                    <span className="font-medium">{meal.name}</span>
                  </div>
                  <span className="text-xs text-muted">{new Date(meal.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="badge badge-green">{meal.calories} cal</span>
                  <span className="badge badge-blue">{meal.protein}g P</span>
                  <span className="badge badge-orange">{meal.carbs}g C</span>
                  <span className="badge badge-red">{meal.fat}g F</span>
                </div>
                {meal.notes && (
                  <p className="text-sm text-muted italic mb-2">"{meal.notes}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Suggestions */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">AI Suggestions</h2>
        {suggestions.length === 0 ? (
          <p className="text-muted text-center py-8">Get personalized suggestions after logging your meals!</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AIIcon className="w-4 h-4 text-primary" />
                    <span className="font-medium">Smart Suggestion</span>
                  </div>
                  <span className="px-2 py-1 rounded-full text-xs bg-primary/20 text-primary">
                    {suggestion.status}
                  </span>
                </div>
                <p className="text-sm text-muted mb-2">{suggestion.tip}</p>
                <div className="space-y-2">
                  {suggestion.suggestions.map((food, foodIndex) => (
                    <div key={foodIndex} className="flex items-center justify-between p-2 bg-card2 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{food.name}</span>
                        <span className="text-xs text-muted">{food.reason}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-primary">{food.cal} cal</span>
                        <span className="text-primary">{food.protein}g P</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <MealPlanClient />
        <WaterTracker />
      </div>
    </div>
  )
}

// Badge component for showing progress toward goals
function Badge({ value, target }: { value: number; target: number }) {
  const percentage = Math.min(100, Math.round((value / target) * 100))
  let color = 'green'

  if (percentage >= 90) color = 'green'
  else if (percentage >= 70) color = 'blue'
  else if (percentage >= 50) color = 'yellow'
  else color = 'red'

  return (
    <span className={`px-2 py-1 rounded-full text-xs bg-${color}-bg text-${color}`}>
      {percentage}%
    </span>
  )
}