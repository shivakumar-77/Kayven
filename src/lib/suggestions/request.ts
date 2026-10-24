import { fetchMeteredAI, type AIIdempotencyStorage } from '@/lib/client/metered-ai-fetch'

export type SuggestionsStatus = 'idle' | 'loading' | 'success' | 'limit' | 'error'

export interface SuggestionsResult {
  status: Exclude<SuggestionsStatus, 'idle' | 'loading'>
  result?: unknown
  message?: string
}

type FetchLike = (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

// Single-flight guard: repeated calls while a request is pending share one request.
export function createSuggestionsRequester(fetcher: FetchLike, storage?: AIIdempotencyStorage) {
  let inflight: Promise<SuggestionsResult> | null = null

  return function request(payload: unknown): Promise<SuggestionsResult> {
    if (inflight) return inflight
    inflight = (async (): Promise<SuggestionsResult> => {
      try {
        const res = await fetchMeteredAI('/api/suggestions', payload, fetcher, storage)
        const data = await res.json()
        if (data?.result) return { status: 'success', result: data.result }
        if (data?.error === 'AI_USAGE_LIMIT_REACHED') {
          return { status: 'limit', message: data.message || 'You have reached your AI limit for this period.' }
        }
        return { status: 'error', message: 'Could not get suggestions. Please try again.' }
      } catch {
        return { status: 'error', message: 'Could not get suggestions. Please try again.' }
      } finally {
        inflight = null
      }
    })()
    return inflight
  }
}
