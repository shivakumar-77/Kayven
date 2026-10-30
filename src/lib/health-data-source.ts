export type HealthDataSourceName = 'manual' | 'browser_gps' | 'healthkit' | 'health_connect' | 'imported'

export type StepReading = {
  start: string
  end: string
  count: number
  sourceRecordId: string
}

export type SleepReading = {
  start: string
  end: string
  durationMinutes: number
  timeInBedMinutes?: number
  stages?: Array<{ stage: string; start: string; end: string }>
  sourceRecordId: string
}

export type HealthPermissionResult =
  | { available: true; granted: true }
  | { available: true; granted: false; reason: string }
  | { available: false; reason: string }

export type HealthReadResult<T> =
  | { available: true; records: T[] }
  | { available: false; reason: string }

export interface HealthDataSourceAdapter {
  readonly source: Exclude<HealthDataSourceName, 'manual' | 'browser_gps'>
  requestPermissions(): Promise<HealthPermissionResult>
  readSteps(start: string, end: string): Promise<HealthReadResult<StepReading[]>>
  readSleep(start: string, end: string): Promise<HealthReadResult<SleepReading[]>>
}

export const WEB_HEALTH_DATA_STATUS = {
  steps: 'Manual totals only; this browser cannot independently measure steps.',
  sleep: 'Manual sleep records only; this browser cannot measure sleep or sleep stages.',
  nativeAdapters: 'HealthKit and Health Connect adapters require a native mobile application.',
} as const
