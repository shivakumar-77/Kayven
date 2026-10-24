// Lightweight dashboard timing. Active in development, or in production when
// localStorage.setItem('kayven:perf', '1') is set. Records only timings and
// route paths; never user data, tokens or query parameters.
const PREFIX = 'kayven:'

function enabled(): boolean {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return false
  if (process.env.NODE_ENV !== 'production') return true
  try { return window.localStorage.getItem('kayven:perf') === '1' } catch { return false }
}

export function perfMark(name: string) {
  if (enabled()) performance.mark(PREFIX + name)
}

export function perfReset() {
  if (!enabled()) return
  for (const entry of performance.getEntriesByType('mark')) {
    if (entry.name.startsWith(PREFIX)) performance.clearMarks(entry.name)
  }
  for (const entry of performance.getEntriesByType('measure')) {
    if (entry.name.startsWith(PREFIX)) performance.clearMeasures(entry.name)
  }
}

export async function perfTime<P extends PromiseLike<unknown>>(name: string, fn: () => P): Promise<Awaited<P>> {
  if (!enabled()) return (await fn()) as Awaited<P>
  const start = performance.now()
  try {
    return (await fn()) as Awaited<P>
  } finally {
    performance.measure(PREFIX + name, { start, end: performance.now() })
  }
}

export function perfReport(label: string) {
  if (!enabled()) return
  const marks = performance.getEntriesByType('mark').filter(e => e.name.startsWith(PREFIX))
  const measures = performance.getEntriesByType('measure').filter(e => e.name.startsWith(PREFIX))
  const navigationStart = marks.find(e => e.name === PREFIX + 'dashboard:mount-start')?.startTime ?? 0
  const paint = performance.getEntriesByName('first-contentful-paint')[0]
  const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter(e => e.startTime >= navigationStart)
  const api = resources
    .filter(e => e.name.includes('/api/') || e.name.includes('.supabase.co'))
    .map(e => ({
      request: new URL(e.name).pathname,
      startMs: Math.round(e.startTime),
      ttfbMs: Math.max(0, Math.round(e.responseStart - e.requestStart)),
      durationMs: Math.round(e.duration),
    }))
  const duplicates = Object.entries(api.reduce<Record<string, number>>((counts, request) => {
    counts[request.request] = (counts[request.request] || 0) + 1
    return counts
  }, {})).filter(([, count]) => count > 1).map(([request, count]) => ({ request, count }))
  const relativeTime = (name: string) => {
    const mark = marks.find(e => e.name === PREFIX + name)
    return mark ? Math.round(mark.startTime - navigationStart) : null
  }
  console.groupCollapsed(`[perf] ${label}`)
  if (paint) console.log('first-contentful-paint ms', Math.round(paint.startTime))
  console.table([
    { milestone: 'shell visible', elapsedMs: relativeTime('dashboard:shell-visible') },
    { milestone: 'auth verified', elapsedMs: relativeTime('dashboard:auth-verified') },
    { milestone: 'core data ready', elapsedMs: relativeTime('dashboard:data-ready') },
    { milestone: 'dashboard painted', elapsedMs: relativeTime('dashboard:painted') },
    { milestone: 'dashboard usable', elapsedMs: relativeTime('dashboard:usable') },
  ])
  console.log('Total browser resource requests since dashboard mount:', resources.length)
  console.log('API/Supabase requests since dashboard mount:', api.length)
  console.log('Duplicate request paths:')
  console.table(duplicates)
  console.table(marks.map(m => ({ mark: m.name.slice(PREFIX.length), atMs: Math.round(m.startTime) })))
  console.table(measures.map(m => ({ measure: m.name.slice(PREFIX.length), durationMs: Math.round(m.duration) })))
  console.table(api)
  console.groupEnd()
}
