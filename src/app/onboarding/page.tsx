'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  buildCompletedProfilePatch,
  buildDraftPatch,
  calculateTargets,
  heightInCm,
  INITIAL_ANSWERS,
  isMissingOnboardingSchema,
  LAST_ONBOARDING_STEP,
  OnboardingAnswers,
  restoreOnboarding,
  safeReturnPath,
  validateOnboardingStep,
  weightInKg,
} from '@/lib/onboarding'
import './onboarding.css'

type AuthUser = { id: string; user_metadata?: Record<string, unknown> }
type Profile = Record<string, unknown> & { onboarding_completed_at?: string | null }
const ONBOARDING_SCHEMA_ERROR = 'Onboarding setup is incomplete in the configured Supabase project. Apply migration 20261024000000_onboarding_profile_state.sql, then refresh this page.'

type GoalOption = { value: Exclude<OnboardingAnswers['goal'], ''>; title: string; description: string; symbol: string }
const goals: GoalOption[] = [
  { value: 'lose', title: 'Lose weight', description: 'Build steady, sustainable habits', symbol: '↘' },
  { value: 'build', title: 'Build muscle', description: 'Get stronger and support muscle growth', symbol: '↗' },
  { value: 'gain', title: 'Gain weight', description: 'Work toward a healthy weight increase', symbol: '+' },
  { value: 'fitness', title: 'Improve fitness', description: 'Feel stronger, fitter, and more consistent', symbol: '⌁' },
  { value: 'maintain', title: 'Maintain my weight', description: 'Keep a steady routine that works for you', symbol: '—' },
]

const activities = [
  { value: 'low', title: 'Mostly sitting', description: 'Little planned movement in a typical week' },
  { value: 'light', title: 'Lightly active', description: 'Some walking or 1–2 training sessions' },
  { value: 'moderate', title: 'Moderately active', description: 'Around 3–5 training sessions' },
  { value: 'high', title: 'Very active', description: 'Frequent training or a physically active routine' },
] as const

const dietOptions = [
  ['none', 'No specific preference'],
  ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['eggetarian', 'Eggetarian'],
  ['non_vegetarian', 'Non-vegetarian'],
  ['other', 'Other'],
] as const

const equipmentOptions = ['Bodyweight', 'Dumbbells', 'Resistance bands', 'Gym machines', 'Barbell']
const stepTitles = ['Welcome', 'Your goal', 'About you', 'Your target', 'Lifestyle', 'Nutrition', 'Fitness', 'Preferences', 'Review']

function nextPathFromLocation() {
  if (typeof window === 'undefined') return null
  return safeReturnPath(new URLSearchParams(window.location.search).get('next'))
}

function Icon({ kind }: { kind: 'spark' | 'check' | 'arrow' | 'shield' }) {
  if (kind === 'check') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
  if (kind === 'arrow') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  if (kind === 'shield') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>
}

function ChoiceButton({
  selected,
  title,
  description,
  symbol,
  onClick,
}: {
  selected: boolean
  title: string
  description?: string
  symbol?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`ob-choice${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {symbol && <span className="ob-choice-symbol" aria-hidden="true">{symbol}</span>}
      <span className="ob-choice-copy">
        <span className="ob-choice-title">{title}</span>
        {description && <span className="ob-choice-description">{description}</span>}
      </span>
      <span className="ob-choice-check" aria-hidden="true"><Icon kind="check" /></span>
    </button>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<OnboardingAnswers>(INITIAL_ANSWERS)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profileExists, setProfileExists] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadingError, setLoadingError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const requestLock = useRef(false)
  const errorSummary = useRef<HTMLDivElement>(null)

  const loadAccount = useCallback(async () => {
    setReady(false)
    setLoadingError('')
    const { data: auth, error: authError } = await supabase.auth.getSession()
    if (authError) {
      setLoadingError('We could not confirm your sign-in. Please try again.')
      setReady(true)
      return
    }
    if (!auth.session) {
      setUser(null)
      setProfileExists(false)
      setReady(true)
      return
    }

    setUser(auth.session.user)
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', auth.session.user.id)
      .maybeSingle()
    if (error) {
      console.error('[Onboarding] Profile load failed', { code: error.code || 'unknown' })
      setLoadingError('We could not load your saved onboarding details. Please try again.')
      setReady(true)
      return
    }
    if (profile?.onboarding_completed_at) {
      router.replace('/dashboard')
      return
    }

    setProfileExists(Boolean(profile))
    const metadataName = typeof auth.session.user.user_metadata?.name === 'string' ? auth.session.user.user_metadata.name : ''
    const restored = restoreOnboarding(profile as Profile | null, metadataName)
    setAnswers(restored.answers)
    setStep(restored.step)
    setReady(true)
  }, [router])

  useEffect(() => {
    void loadAccount().catch(() => {
      console.error('[Onboarding] Account load failed unexpectedly')
      setLoadingError('We could not load your saved onboarding details. Please try again.')
      setReady(true)
    })
  }, [loadAccount])

  const persistDraft = useCallback(async (nextStep: number, nextAnswers: OnboardingAnswers) => {
    if (!user || requestLock.current) return false
    requestLock.current = true
    setSaving(true)
    setSaveError('')
    try {
      const { error } = await supabase.from('profiles').upsert(
        buildDraftPatch(user.id, nextAnswers, nextStep, profileExists),
        { onConflict: 'id' },
      )
      if (error) {
        console.error('[Onboarding] Draft save failed', { code: error.code || 'unknown' })
        setSaveError(isMissingOnboardingSchema(error)
          ? ONBOARDING_SCHEMA_ERROR
          : 'Your progress could not be saved. Check your connection and try again.')
        return false
      }
      setProfileExists(true)
      return true
    } catch {
      console.error('[Onboarding] Draft save failed unexpectedly')
      setSaveError('Your progress could not be saved. Check your connection and try again.')
      return false
    } finally {
      requestLock.current = false
      setSaving(false)
    }
  }, [profileExists, user])

  useEffect(() => {
    if (!ready || !user || step < 1 || step > 7) return
    const timer = window.setTimeout(() => { void persistDraft(step, answers) }, 700)
    return () => window.clearTimeout(timer)
  }, [answers, persistDraft, ready, step, user])

  const updateAnswer = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
    setAnswers(previous => ({ ...previous, [key]: value }))
    setFieldErrors(previous => {
      if (!previous[key as string]) return previous
      const next = { ...previous }
      delete next[key as string]
      return next
    })
    setSaveError('')
  }

  const showValidationErrors = (errors: Record<string, string>) => {
    setFieldErrors(errors)
    window.requestAnimationFrame(() => errorSummary.current?.focus())
  }

  const continueTo = async (nextStep: number) => {
    const errors = validateOnboardingStep(step, answers)
    if (Object.keys(errors).length) {
      showValidationErrors(errors)
      return
    }
    if (!user) {
      router.push('/auth?mode=signup&next=%2Fonboarding')
      return
    }
    if (await persistDraft(nextStep, answers)) {
      setFieldErrors({})
      setStep(nextStep)
    }
  }

  const goBack = async () => {
    setSaveError('')
    if (step <= 1) {
      setStep(0)
      return
    }
    const previousStep = step - 1
    if (await persistDraft(previousStep, answers)) setStep(previousStep)
  }

  const editStep = async (targetStep: number) => {
    if (await persistDraft(targetStep, answers)) setStep(targetStep)
  }

  const startOnboarding = async () => {
    if (!user) {
      router.push('/auth?mode=signup&next=%2Fonboarding')
      return
    }
    if (await persistDraft(1, answers)) setStep(1)
  }

  const completeOnboarding = async () => {
    for (const requiredStep of [1, 2, 3, 4, 5, 6]) {
      const errors = validateOnboardingStep(requiredStep, answers)
      if (Object.keys(errors).length) {
        setStep(requiredStep)
        showValidationErrors(errors)
        return
      }
    }
    if (!user) {
      router.push('/auth?next=%2Fonboarding')
      return
    }
    if (requestLock.current) return
    requestLock.current = true
    setSaving(true)
    setSaveError('')
    try {
      const patch = buildCompletedProfilePatch(user.id, answers, profileExists, new Date().toISOString())
      const { error } = await supabase.from('profiles').upsert(patch, { onConflict: 'id' })
      if (error) {
        console.error('[Onboarding] Completion save failed', { code: error.code || 'unknown' })
        setSaveError(isMissingOnboardingSchema(error)
          ? ONBOARDING_SCHEMA_ERROR
          : 'Your profile could not be saved. Your answers are still here—please try again.')
        return
      }
      setProfileExists(true)
      setStep(9)
    } catch {
      console.error('[Onboarding] Completion save failed unexpectedly')
      setSaveError('Your profile could not be saved. Your answers are still here—please try again.')
    } finally {
      requestLock.current = false
      setSaving(false)
    }
  }

  const changeUnits = (units: 'metric' | 'imperial') => {
    if (units === answers.units) return
    setFieldErrors({})
    const convert = (value: string, factor: number) => value && Number.isFinite(Number(value))
      ? String(Number((Number(value) * factor).toFixed(1)))
      : value
    const factor = units === 'imperial' ? 1 / 2.54 : 2.54
    const weightFactor = units === 'imperial' ? 2.2046226218 : 1 / 2.2046226218
    setAnswers(previous => ({
      ...previous,
      units,
      height: convert(previous.height, factor),
      weight: convert(previous.weight, weightFactor),
      targetWeight: convert(previous.targetWeight, weightFactor),
    }))
  }

  const targets = calculateTargets(answers)
  const isTargetRelevant = ['lose', 'build', 'gain'].includes(answers.goal)
  const displayWeightUnit = answers.units === 'imperial' ? 'lb' : 'kg'
  const displayHeightUnit = answers.units === 'imperial' ? 'in' : 'cm'
  const destination = nextPathFromLocation()

  if (!ready) {
    return <div className="ob-loading" role="status" aria-live="polite"><span className="ob-spinner" />Preparing your onboarding</div>
  }
  if (loadingError) {
    return (
      <main className="ob-loading-error">
        <Image src="/Kayven.PNG" alt="Kayven" width={44} height={44} />
        <h1>We hit a connection issue</h1>
        <p>{loadingError}</p>
        <button className="ob-button ob-button-primary" type="button" onClick={() => void loadAccount()}>Try again</button>
      </main>
    )
  }

  return (
    <div className="onboarding-shell">
      <div className="ob-layout">
        <aside className="ob-aside" aria-label="About Kayven">
          <Link className="ob-brand" href="/" aria-label="Kayven home">
            <Image src="/Kayven.PNG" alt="" width={44} height={44} priority />
            <span>KAYVEN</span>
          </Link>
          <div className="ob-aside-copy">
            <div className="ob-kicker"><Icon kind="spark" /> YOUR HEALTH, IN SYNC</div>
            <p>Good habits work better <span>together.</span></p>
            <span className="ob-aside-note">Bring nutrition, movement, and everyday progress into one thoughtful routine.</span>
          </div>
          <div className="ob-aside-foot"><Icon kind="shield" /><span>Your answers stay with your account and can be updated later.</span></div>
        </aside>

        <main className="ob-main">
          {step > 0 && step < 9 && (
            <header className="ob-progress-header">
              <div className="ob-progress-top"><span>YOUR KAYVEN PROFILE</span><span>Step {step} of {LAST_ONBOARDING_STEP}</span></div>
              <div className="ob-progress-track" role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={LAST_ONBOARDING_STEP} aria-valuenow={step}>
                <span style={{ width: `${(step / LAST_ONBOARDING_STEP) * 100}%` }} />
              </div>
              <div className="ob-step-labels" aria-hidden="true">{stepTitles.slice(1).map((title, index) => <span className={step === index + 1 ? 'is-current' : step > index + 1 ? 'is-done' : ''} key={title}>{title}</span>)}</div>
            </header>
          )}

          <section className={`ob-card${step === 0 || step === 9 ? ' ob-card-intro' : ''}`} aria-labelledby="onboarding-title">
            {saveError && <div className="ob-save-error" role="alert">{saveError}</div>}
            {Object.keys(fieldErrors).length > 0 && (
              <div className="ob-error-summary" ref={errorSummary} role="alert" tabIndex={-1} aria-labelledby="ob-error-title">
                <strong id="ob-error-title">A couple of details need attention</strong>
                <ul>{Object.entries(fieldErrors).map(([field, message]) => <li key={field}><a href={`#${field}`}>{message}</a></li>)}</ul>
              </div>
            )}

            {step === 0 && (
              <div className="ob-welcome ob-enter">
                <div className="ob-mobile-brand"><Image src="/Kayven.PNG" alt="" width={48} height={48} priority /><span>KAYVEN</span></div>
                <div className="ob-welcome-mark"><Icon kind="spark" /></div>
                <p className="ob-eyebrow">A MORE CONNECTED WAY TO FEEL WELL</p>
                <h1 id="onboarding-title">Your health.<br /><span>Connected.</span></h1>
                <p className="ob-lead">Nutrition, fitness, and personalized guidance—working together around your goals.</p>
                <div className="ob-welcome-points">
                  <div><span><Icon kind="check" /></span><p>Start with what matters to you</p></div>
                  <div><span><Icon kind="check" /></span><p>Build a profile you can refine over time</p></div>
                </div>
                <button className="ob-button ob-button-primary ob-welcome-cta" type="button" onClick={() => void startOnboarding()} disabled={saving}>
                  Get started <Icon kind="arrow" />
                </button>
                <p className="ob-signin">Already have an account? <Link href="/auth?next=%2Fonboarding">Sign in</Link></p>
                {!user && <p className="ob-auth-note">You’ll create or sign in to an account before saving your profile.</p>}
              </div>
            )}

            {step === 1 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">START WITH YOUR WHY</p>
                <h1 id="onboarding-title">What would you like to focus on?</h1>
                <p className="ob-lead">Choose one main goal. You can adjust it whenever your priorities change.</p>
                <div className="ob-choice-list" id="goal" tabIndex={-1} role="group" aria-label="Primary health goal" aria-describedby={fieldErrors.goal ? 'goal-error' : undefined}>
                  {goals.map(goal => <ChoiceButton key={goal.value} selected={answers.goal === goal.value} title={goal.title} description={goal.description} symbol={goal.symbol} onClick={() => updateAnswer('goal', goal.value)} />)}
                </div>
                {fieldErrors.goal && <p className="ob-field-error" id="goal-error">{fieldErrors.goal}</p>}
              </div>
            )}

            {step === 2 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">A FEW BASICS</p>
                <h1 id="onboarding-title">Let’s make this yours.</h1>
                <p className="ob-lead">These details help estimate your daily nutrition targets. You can leave your name and sex blank.</p>
                <div className="ob-field-grid">
                  <label className="ob-field ob-field-wide" htmlFor="name"><span>Your name <small>Optional</small></span><input id="name" autoComplete="given-name" maxLength={80} value={answers.name} onChange={event => updateAnswer('name', event.target.value)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'name-error' : undefined} placeholder="How should we address you?" />{fieldErrors.name && <small className="ob-field-error" id="name-error">{fieldErrors.name}</small>}</label>
                  <div className="ob-field ob-field-wide">
                    <span>Measurement units</span>
                    <div className="ob-segmented" role="group" aria-label="Measurement units">
                      <button type="button" aria-pressed={answers.units === 'metric'} className={answers.units === 'metric' ? 'is-selected' : ''} onClick={() => changeUnits('metric')}>Metric <small>cm · kg</small></button>
                      <button type="button" aria-pressed={answers.units === 'imperial'} className={answers.units === 'imperial' ? 'is-selected' : ''} onClick={() => changeUnits('imperial')}>Imperial <small>in · lb</small></button>
                    </div>
                  </div>
                  <label className="ob-field" htmlFor="age"><span>Age <small>years</small></span><input id="age" inputMode="numeric" type="number" min={18} max={100} value={answers.age} onChange={event => updateAnswer('age', event.target.value)} aria-invalid={Boolean(fieldErrors.age)} aria-describedby={fieldErrors.age ? 'age-error' : undefined} placeholder="e.g. 28" />{fieldErrors.age && <small className="ob-field-error" id="age-error">{fieldErrors.age}</small>}</label>
                  <label className="ob-field" htmlFor="height"><span>Height <small>{displayHeightUnit}</small></span><input id="height" inputMode="decimal" type="number" min={answers.units === 'imperial' ? 39 : 100} max={answers.units === 'imperial' ? 95 : 240} step="any" value={answers.height} onChange={event => updateAnswer('height', event.target.value)} aria-invalid={Boolean(fieldErrors.height)} aria-describedby={fieldErrors.height ? 'height-error' : undefined} placeholder={answers.units === 'imperial' ? 'e.g. 68' : 'e.g. 172'} />{fieldErrors.height && <small className="ob-field-error" id="height-error">{fieldErrors.height}</small>}</label>
                  <label className="ob-field ob-field-wide" htmlFor="weight"><span>Current weight <small>{displayWeightUnit}</small></span><input id="weight" inputMode="decimal" type="number" min={answers.units === 'imperial' ? 55 : 25} max={answers.units === 'imperial' ? 660 : 300} step="any" value={answers.weight} onChange={event => updateAnswer('weight', event.target.value)} aria-invalid={Boolean(fieldErrors.weight)} aria-describedby={fieldErrors.weight ? 'weight-error' : undefined} placeholder={answers.units === 'imperial' ? 'e.g. 150' : 'e.g. 68'} />{fieldErrors.weight && <small className="ob-field-error" id="weight-error">{fieldErrors.weight}</small>}</label>
                </div>
                <fieldset className="ob-fieldset">
                  <legend>Sex used for calorie estimates <small>Optional</small></legend>
                  <p className="ob-field-help">A common nutrition formula uses this to estimate resting energy. If you skip it, Kayven uses a neutral estimate instead.</p>
                  <div className="ob-inline-options">
                    {(['female', 'male'] as const).map(sex => <button key={sex} type="button" className={`ob-pill${answers.sex === sex ? ' is-selected' : ''}`} aria-pressed={answers.sex === sex} onClick={() => updateAnswer('sex', answers.sex === sex ? '' : sex)}>{sex === 'female' ? 'Female' : 'Male'}</button>)}
                    <button type="button" className={`ob-pill${answers.sex === 'prefer_not_to_say' ? ' is-selected' : ''}`} aria-pressed={answers.sex === 'prefer_not_to_say'} onClick={() => updateAnswer('sex', answers.sex === 'prefer_not_to_say' ? '' : 'prefer_not_to_say')}>Prefer not to say</button>
                  </div>
                </fieldset>
              </div>
            )}

            {step === 3 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">A DIRECTION, NOT A DEADLINE</p>
                <h1 id="onboarding-title">Set a target, if it’s useful.</h1>
                {isTargetRelevant ? (
                  <>
                    <p className="ob-lead">A weight target is optional. Keep it to a manageable milestone; estimates are guidance, not medical advice.</p>
                    <div className="ob-field-grid ob-field-grid-single">
                      <label className="ob-field" htmlFor="targetWeight"><span>Target weight <small>{displayWeightUnit} · optional</small></span><input id="targetWeight" inputMode="decimal" type="number" step="any" min={answers.units === 'imperial' ? 55 : 25} max={answers.units === 'imperial' ? 660 : 300} value={answers.targetWeight} onChange={event => updateAnswer('targetWeight', event.target.value)} aria-invalid={Boolean(fieldErrors.targetWeight)} aria-describedby={fieldErrors.targetWeight ? 'targetWeight-error' : 'target-weight-hint'} placeholder="Leave blank to skip" />{fieldErrors.targetWeight ? <small className="ob-field-error" id="targetWeight-error">{fieldErrors.targetWeight}</small> : <small className="ob-field-help" id="target-weight-hint">We’ll flag unusually large changes so you can choose a nearer milestone.</small>}</label>
                      <label className="ob-field" htmlFor="targetDate"><span>Target date <small>Optional</small></span><input id="targetDate" type="date" value={answers.targetDate} onChange={event => updateAnswer('targetDate', event.target.value)} aria-invalid={Boolean(fieldErrors.targetDate)} aria-describedby={fieldErrors.targetDate ? 'targetDate-error' : undefined} />{fieldErrors.targetDate && <small className="ob-field-error" id="targetDate-error">{fieldErrors.targetDate}</small>}</label>
                    </div>
                  </>
                ) : (
                  <div className="ob-info-panel"><span className="ob-info-mark"><Icon kind="spark" /></span><div><strong>A number isn’t needed for this goal.</strong><p>We’ll focus your profile on activity and consistent habits instead.</p></div></div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">YOUR EVERYDAY ROUTINE</p>
                <h1 id="onboarding-title">How active is a typical week?</h1>
                <p className="ob-lead">Pick the closest fit—not your ideal week. This helps estimate energy needs.</p>
                <div className="ob-choice-list" id="activity" tabIndex={-1} role="group" aria-label="Typical activity level" aria-describedby={fieldErrors.activity ? 'activity-error' : undefined}>
                  {activities.map(activity => <ChoiceButton key={activity.value} selected={answers.activity === activity.value} title={activity.title} description={activity.description} onClick={() => updateAnswer('activity', activity.value)} />)}
                </div>
                {fieldErrors.activity && <p className="ob-field-error" id="activity-error">{fieldErrors.activity}</p>}
              </div>
            )}

            {step === 5 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">FOOD THAT FITS YOU</p>
                <h1 id="onboarding-title">Any way you like to eat?</h1>
                <p className="ob-lead">This helps shape food ideas. Choose “No specific preference” if you don’t want to set one.</p>
                <div className="ob-diet-grid" id="diet" tabIndex={-1} role="group" aria-label="Dietary preference" aria-describedby={fieldErrors.diet ? 'diet-error' : undefined}>
                  {dietOptions.map(([value, label]) => <button key={value} type="button" className={`ob-pill${answers.diet === value ? ' is-selected' : ''}`} aria-pressed={answers.diet === value} onClick={() => updateAnswer('diet', value)}>{label}</button>)}
                </div>
                {answers.diet === 'other' && <label className="ob-field ob-spaced" htmlFor="dietOther"><span>Describe your preference</span><input id="dietOther" maxLength={100} value={answers.dietOther} onChange={event => updateAnswer('dietOther', event.target.value)} aria-invalid={Boolean(fieldErrors.dietOther)} aria-describedby={fieldErrors.dietOther ? 'dietOther-error' : undefined} placeholder="For example, pescatarian" />{fieldErrors.dietOther && <small className="ob-field-error" id="dietOther-error">{fieldErrors.dietOther}</small>}</label>}
                {fieldErrors.diet && <p className="ob-field-error ob-spaced" id="diet-error">{fieldErrors.diet}</p>}
                <div className="ob-field-grid ob-field-grid-single ob-spaced">
                  <label className="ob-field" htmlFor="allergies"><span>Food allergies <small>Optional</small></span><textarea id="allergies" rows={2} maxLength={500} value={answers.allergies} onChange={event => updateAnswer('allergies', event.target.value)} placeholder="List foods you need to avoid" /></label>
                  <label className="ob-field" htmlFor="restrictions"><span>Other food preferences <small>Optional</small></span><textarea id="restrictions" rows={2} maxLength={500} value={answers.restrictions} onChange={event => updateAnswer('restrictions', event.target.value)} placeholder="Ingredients or cuisines you prefer to avoid" /></label>
                </div>
                <p className="ob-safety-note">Kayven records your preferences; it can’t diagnose allergies or guarantee allergen-free food.</p>
              </div>
            )}

            {step === 6 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">MOVEMENT THAT WORKS FOR YOU</p>
                <h1 id="onboarding-title">Your training starting point.</h1>
                <p className="ob-lead">There are no right answers. You can change your routine as you go.</p>
                <fieldset className="ob-fieldset" id="experience" tabIndex={-1} aria-describedby={fieldErrors.experience ? 'experience-error' : undefined}>
                  <legend>Experience</legend>
                  <div className="ob-inline-options">
                    {(['beginner', 'intermediate', 'advanced'] as const).map(level => <button key={level} type="button" className={`ob-pill${answers.experience === level ? ' is-selected' : ''}`} aria-pressed={answers.experience === level} onClick={() => updateAnswer('experience', level)}>{level[0].toUpperCase() + level.slice(1)}</button>)}
                  </div>
                  {fieldErrors.experience && <p className="ob-field-error" id="experience-error">{fieldErrors.experience}</p>}
                </fieldset>
                <fieldset className="ob-fieldset" id="trainingLocation" tabIndex={-1} aria-describedby={fieldErrors.trainingLocation ? 'trainingLocation-error' : undefined}>
                  <legend>Where do you usually train?</legend>
                  <div className="ob-inline-options">
                    {(['home', 'gym'] as const).map(place => <button key={place} type="button" className={`ob-pill${answers.trainingLocation === place ? ' is-selected' : ''}`} aria-pressed={answers.trainingLocation === place} onClick={() => updateAnswer('trainingLocation', place)}>{place === 'home' ? 'At home' : 'At a gym'}</button>)}
                  </div>
                  {fieldErrors.trainingLocation && <p className="ob-field-error" id="trainingLocation-error">{fieldErrors.trainingLocation}</p>}
                </fieldset>
                <fieldset className="ob-fieldset">
                  <legend>Equipment you can use <small>Optional</small></legend>
                  <div className="ob-diet-grid ob-equipment-grid">
                    {equipmentOptions.map(item => {
                      const selected = answers.equipment.includes(item)
                      return <button key={item} type="button" className={`ob-pill${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => updateAnswer('equipment', selected ? answers.equipment.filter(value => value !== item) : [...answers.equipment, item])}>{item}</button>
                    })}
                  </div>
                </fieldset>
                <div className="ob-field-grid">
                  <label className="ob-field" htmlFor="trainingDays"><span>Training days <small>per week</small></span><select id="trainingDays" value={answers.trainingDays} onChange={event => updateAnswer('trainingDays', event.target.value)} aria-invalid={Boolean(fieldErrors.trainingDays)} aria-describedby={fieldErrors.trainingDays ? 'trainingDays-error' : undefined}><option value="">Choose</option>{Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} {index === 0 ? 'day' : 'days'}</option>)}</select>{fieldErrors.trainingDays && <small className="ob-field-error" id="trainingDays-error">{fieldErrors.trainingDays}</small>}</label>
                  <label className="ob-field" htmlFor="workoutMinutes"><span>Typical session <small>optional · min</small></span><input id="workoutMinutes" type="number" inputMode="numeric" min={10} max={180} step={5} value={answers.workoutMinutes} onChange={event => updateAnswer('workoutMinutes', event.target.value)} aria-invalid={Boolean(fieldErrors.workoutMinutes)} aria-describedby={fieldErrors.workoutMinutes ? 'workoutMinutes-error' : undefined} placeholder="e.g. 45" />{fieldErrors.workoutMinutes && <small className="ob-field-error" id="workoutMinutes-error">{fieldErrors.workoutMinutes}</small>}</label>
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">YOUR PREFERENCES</p>
                <h1 id="onboarding-title">Make Kayven feel right for you.</h1>
                <p className="ob-lead">Your measurement units are set to {answers.units === 'imperial' ? 'imperial (inches and pounds)' : 'metric (centimeters and kilograms)'}. You can change them in your profile later.</p>
                <div className="ob-info-panel ob-preference-panel">
                  <span className="ob-info-mark"><Icon kind="shield" /></span>
                  <div><strong>Reminders stay off until you choose.</strong><p>Kayven won’t request notification permission during onboarding. You can configure a schedule later in Notifications.</p></div>
                </div>
                <button type="button" className={`ob-toggle-row${answers.reminderInterest ? ' is-selected' : ''}`} role="switch" aria-checked={answers.reminderInterest} onClick={() => updateAnswer('reminderInterest', !answers.reminderInterest)}>
                  <span><strong>Remind me to set up reminders later</strong><small>This saves a preference only; it does not enable notifications.</small></span>
                  <span className="ob-switch" aria-hidden="true"><span /></span>
                </button>
              </div>
            )}

            {step === 8 && (
              <div className="ob-enter">
                <p className="ob-eyebrow">YOUR PROFILE, AT A GLANCE</p>
                <h1 id="onboarding-title">Take a look before we save.</h1>
                <p className="ob-lead">Kayven will use these details to set your starting nutrition targets and tailor available food and workout features. No AI-generated plan is being created here.</p>
                <div className="ob-review-list">
                  <ReviewSection title="Goal" value={goals.find(item => item.value === answers.goal)?.title || 'Not selected'} onEdit={() => void editStep(1)} />
                  {answers.name && <ReviewSection title="Name" value={answers.name} onEdit={() => void editStep(2)} />}
                  <ReviewSection title="About you" value={`${answers.age} years · ${answers.height} ${displayHeightUnit} · ${answers.weight} ${displayWeightUnit}${answers.sex === 'prefer_not_to_say' ? ' · sex not provided' : answers.sex ? ` · ${answers.sex}` : ''}`} onEdit={() => void editStep(2)} />
                  <ReviewSection title="Target" value={answers.targetWeight ? `${answers.targetWeight} ${displayWeightUnit}${answers.targetDate ? ` · by ${answers.targetDate}` : ''}` : 'No target weight set'} onEdit={() => void editStep(3)} />
                  <ReviewSection title="Lifestyle" value={activities.find(item => item.value === answers.activity)?.title || 'Not selected'} onEdit={() => void editStep(4)} />
                  <ReviewSection title="Nutrition" value={`${dietOptions.find(([value]) => value === answers.diet)?.[1] || 'Not selected'}${answers.diet === 'other' && answers.dietOther ? ` · ${answers.dietOther}` : ''}${answers.allergies ? ` · avoid: ${answers.allergies}` : ''}${answers.restrictions ? ` · preferences: ${answers.restrictions}` : ''}`} onEdit={() => void editStep(5)} />
                  <ReviewSection title="Fitness" value={`${answers.experience || 'Not selected'} · ${answers.trainingLocation || 'Not selected'} · ${answers.trainingDays || '?'} days/week${answers.workoutMinutes ? ` · ${answers.workoutMinutes} min` : ''}${answers.equipment.length ? ` · ${answers.equipment.join(', ')}` : ''}`} onEdit={() => void editStep(6)} />
                  <ReviewSection title="Preferences" value={`${answers.units === 'imperial' ? 'Imperial units' : 'Metric units'}${answers.reminderInterest ? ' · reminder setup later' : ''}`} onEdit={() => void editStep(7)} />
                </div>
                {targets && <div className="ob-targets">
                  <div className="ob-targets-heading"><span>Starting daily estimates</span><span>Adjustable anytime</span></div>
                  <div className="ob-target-grid">
                    {[['Calories', targets.calories, 'kcal'], ['Protein', targets.protein, 'g'], ['Carbs', targets.carbs, 'g'], ['Fat', targets.fat, 'g']].map(([label, value, unit]) => <div className="ob-target-item" key={label}><span>{label}</span><strong>{value}<small> {unit}</small></strong></div>)}
                  </div>
                  <p className="ob-disclaimer">These general estimates are not medical advice. Individual needs vary; consult a qualified health professional if you need clinical guidance.</p>
                </div>}
              </div>
            )}

            {step === 9 && (
              <div className="ob-complete ob-enter">
                <div className="ob-complete-mark"><Icon kind="check" /></div>
                <p className="ob-eyebrow">PROFILE SAVED</p>
                <h1 id="onboarding-title">Your Kayven journey starts here.</h1>
                <p className="ob-lead">Your profile and starting nutrition estimates are saved. You can revisit your details and change your goals whenever you need.</p>
                {targets && <div className="ob-complete-target"><span>Starting daily calorie estimate</span><strong>{targets.calories.toLocaleString()} <small>kcal</small></strong></div>}
                <button type="button" className="ob-button ob-button-primary ob-welcome-cta" onClick={() => router.replace(destination && destination !== '/onboarding' ? destination : '/dashboard')}>
                  Go to Kayven <Icon kind="arrow" />
                </button>
                {answers.reminderInterest && <p className="ob-auth-note">Reminder setup is still off. You can choose a schedule in Notifications.</p>}
              </div>
            )}

            {step === 0 && <div className="ob-trust-line"><Icon kind="shield" /><span>Your profile is private to your account.</span></div>}
          </section>

          {step > 0 && step < 9 && (
            <div className="ob-actions">
              <button type="button" className="ob-button ob-button-secondary" onClick={() => void goBack()} disabled={saving}>Back</button>
              {step < 8 ? (
                <button type="button" className="ob-button ob-button-primary" onClick={() => void continueTo(step + 1)} disabled={saving}>
                  {saving ? 'Saving…' : step === 7 ? 'Review answers' : 'Continue'} <Icon kind="arrow" />
                </button>
              ) : (
                <button type="button" className="ob-button ob-button-primary" onClick={() => void completeOnboarding()} disabled={saving}>
                  {saving ? 'Saving profile…' : 'Save and finish'} <Icon kind="arrow" />
                </button>
              )}
            </div>
          )}
          <footer className="ob-footer">A thoughtful start. Your profile can always evolve.</footer>
        </main>
      </div>
    </div>
  )
}

function ReviewSection({ title, value, onEdit }: { title: string; value: string; onEdit: () => void }) {
  return (
    <div className="ob-review-row">
      <div><span>{title}</span><strong>{value}</strong></div>
      <button type="button" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>Edit</button>
    </div>
  )
}
