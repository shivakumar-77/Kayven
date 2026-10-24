type AIResponse = Pick<Response, 'ok' | 'status' | 'json'>
type AIFetcher = (input: string, init: RequestInit) => Promise<AIResponse>
export type AIIdempotencyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function fingerprint(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function fetchMeteredAI(
  endpoint: string,
  payload: unknown,
  fetcher: AIFetcher = fetch,
  storage: AIIdempotencyStorage = window.sessionStorage,
): Promise<AIResponse> {
  const body = JSON.stringify(payload)
  if (typeof body !== 'string') throw new Error('AI request payload is not serializable')

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  const payloadFingerprint = fingerprint(new Uint8Array(digest))
  const storageKey = `kayven-ai-idempotency:${endpoint}:${payloadFingerprint}`
  const previous = storage.getItem(storageKey)
  let idempotencyKey: string

  if (previous) {
    try {
      const parsed = JSON.parse(previous)
      idempotencyKey = parsed.fingerprint === payloadFingerprint && typeof parsed.key === 'string'
        ? parsed.key
        : crypto.randomUUID()
    } catch {
      idempotencyKey = crypto.randomUUID()
    }
  } else {
    idempotencyKey = crypto.randomUUID()
  }

  storage.setItem(storageKey, JSON.stringify({ fingerprint: payloadFingerprint, key: idempotencyKey }))
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body,
  })

  if (response.status >= 400 && response.status < 500 && response.status !== 409) {
    storage.removeItem(storageKey)
  }
  return {
    ok: response.ok,
    status: response.status,
    json: async () => {
      const result = await response.json()
      if (response.ok) storage.removeItem(storageKey)
      return result
    },
  }
}
