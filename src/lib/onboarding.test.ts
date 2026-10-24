import assert from 'node:assert/strict'
import {
  INITIAL_ANSWERS, buildCompletedProfilePatch, calculateTargets,
  isMissingOnboardingSchema, restoreOnboarding, safeReturnPath, validateOnboardingStep,
} from './onboarding'

export function runOnboardingTests() {
  assert.equal(isMissingOnboardingSchema({
    code: 'PGRST204',
    message: "Could not find the 'onboarding_data' column in the schema cache",
  }), true)
  assert.equal(isMissingOnboardingSchema({ code: '42703', message: 'column onboarding_completed_at does not exist' }), true)
  assert.equal(isMissingOnboardingSchema({ code: 'PGRST204', message: "Could not find the 'name' column" }), false)

  assert.equal(safeReturnPath('/dashboard'), '/dashboard')
  assert.equal(safeReturnPath('//evil.example'), null)
  assert.equal(safeReturnPath('https://evil.example'), null)
  assert.equal(safeReturnPath('/auth/callback'), null)
  assert.equal(safeReturnPath('/onboarding'), null)

  const answers = {
    ...INITIAL_ANSWERS,
    goal: 'lose' as const,
    age: '31', height: '172', weight: '78', activity: 'moderate' as const,
    diet: 'none' as const, experience: 'beginner' as const,
    trainingLocation: 'home' as const, trainingDays: '3',
  }
  assert.deepEqual(validateOnboardingStep(1, answers), {})
  assert.deepEqual(validateOnboardingStep(2, answers), {})
  assert.equal(Object.keys(validateOnboardingStep(6, { ...answers, trainingDays: '' })).includes('trainingDays'), true)
  assert.equal(calculateTargets(answers)?.calories && calculateTargets(answers)!.calories >= 1200, true)
  assert.equal(validateOnboardingStep(3, { ...answers, targetWeight: '95' }).targetWeight !== undefined, true)

  const restored = restoreOnboarding({ onboarding_data: { currentStep: 5, answers: { ...answers, allergies: 'peanuts' } } })
  assert.equal(restored.step, 5)
  assert.equal(restored.answers.allergies, 'peanuts')
  assert.equal(restoreOnboarding({ age: 31, height: 172, current_weight_kg: 78 }).answers.sex, '')

  const patch = buildCompletedProfilePatch('user-id', answers, true, '2026-10-24T00:00:00.000Z')
  assert.equal(patch.onboarding_completed_at, '2026-10-24T00:00:00.000Z')
  assert.equal(patch.gender, undefined, 'optional sex is not invented')
  assert.equal(patch.current_weight_kg, 78)
  assert.equal(patch.goal, 'lose')
  console.log('Onboarding validation, persistence and completion checks passed.')
}
