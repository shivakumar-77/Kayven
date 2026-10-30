import assert from 'node:assert/strict'
import {
  acceptGpsPoint,
  activityMetrics,
  activeDurationSeconds,
  buildSleepInterval,
  dateInTimeZone,
  distanceBetweenMeters,
  estimateActivityCalories,
  gpsErrorState,
  isValidTimeZone,
  pauseActivityClock,
  paceSecondsPerKm,
  resumeActivityClock,
  startActivityClock,
  stepProgress,
} from './health-tracking'

export function runHealthTrackingTests() {
  const startedClock = startActivityClock(1000)
  const pausedClock = pauseActivityClock(startedClock, 6000)
  assert.equal(activeDurationSeconds(pausedClock, 16_000), 5)
  const resumedClock = resumeActivityClock(pausedClock, 16_000)
  assert.equal(activeDurationSeconds(resumedClock, 21_000), 10)
  assert.equal(activeDurationSeconds(resumedClock, 31_000), 20)
  assert.deepEqual(activityMetrics('run', 1000, 300, 70), {
    averagePaceSecondsPerKm: 300,
    averageSpeedMetersPerSecond: 1000 / 300,
    estimatedCalories: 43,
  })
  assert.equal(gpsErrorState(1, 1), 'denied')
  assert.equal(gpsErrorState(2, 1), 'lost')
  assert.equal(isValidTimeZone('Asia/Kolkata'), true)
  assert.equal(isValidTimeZone('not/a-zone'), false)
  assert.deepEqual(stepProgress(4000, 8000), { percent: 50, remaining: 4000 })
  assert.deepEqual(stepProgress(9000, 8000), { percent: 100, remaining: 0 })
  assert.equal(distanceBetweenMeters(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.001 },
  ) > 100, true)
  assert.equal(acceptGpsPoint({ latitude: 91, longitude: 0, timestamp: 1, accuracy: 5 }), false)
  assert.equal(acceptGpsPoint({ latitude: 10, longitude: 10, timestamp: 1, accuracy: 60 }), false)
  const previous = { latitude: 10, longitude: 10, timestamp: 1_000, accuracy: 5 }
  assert.equal(acceptGpsPoint({ latitude: 10, longitude: 10, timestamp: 5_000, accuracy: 5 }, previous), false)
  assert.equal(acceptGpsPoint({ latitude: 10, longitude: 10.0004, timestamp: 5_000, accuracy: 5 }, previous), true)
  assert.equal(acceptGpsPoint({ latitude: 10.001, longitude: 10, timestamp: 5_000, accuracy: 5 }, previous), false)
  assert.equal(paceSecondsPerKm(1000, 360), 360)
  assert.equal(paceSecondsPerKm(50, 360), null)
  assert.equal(estimateActivityCalories('walk', 1800, null), null)
  assert.equal(estimateActivityCalories('walk', 1800, 70), 129)
  const overnight = buildSleepInterval('2026-10-25', '22:30', '06:30', 'UTC')
  assert.equal(overnight?.durationMinutes, 480)
  assert.equal(overnight?.start.toISOString().slice(0, 10), '2026-10-24')
  assert.equal(buildSleepInterval('2026-10-25', '06:30', '22:30', 'UTC')?.durationMinutes, 960)
  assert.equal(buildSleepInterval('2026-10-25', '22:30', '22:30'), null)
  assert.equal(buildSleepInterval('2026-03-08', '02:30', '07:30', 'America/New_York'), null)
  assert.equal(buildSleepInterval('2026-11-01', '00:30', '07:30', 'America/New_York')?.durationMinutes, 480)
  assert.equal(dateInTimeZone(new Date('2026-10-25T20:00:00Z'), 'Asia/Kolkata'), '2026-10-26')
}
