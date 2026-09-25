import { AUTH_BYPASS } from '../config/auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  status: number
  detail?: string
  /** Machine-readable `error` field from a `{error, message}` body (e.g.
   * `leaf_folder`, `feature_disabled`) — distinct from `detail`, which is
   * the human-readable text a caller can show as-is (from `detail` or
   * `message`, falling back to `error` only when neither is present). */
  code?: string

  constructor(message: string, status: number, detail?: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.code = code
  }
}

export function getApiBaseUrl(): string {
  return API_BASE_URL
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  auth?: boolean
}

type SessionExpiredHandler = () => void
let onSessionExpired: SessionExpiredHandler | null = null

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null) {
  onSessionExpired = handler
}

function resolveCredentials(auth: boolean): RequestCredentials | undefined {
  if (!auth || AUTH_BYPASS) return 'same-origin'
  return 'include'
}

interface ParsedErrorBody {
  detail?: string
  code?: string
}

/** Parses a JSON error body into a human-readable `detail` (preferring
 * `detail`, then `message` — the adapter's `{error, message}` shape — and
 * finally falling back to the machine-readable `error` code itself when
 * neither is present) plus that `error` code as `code`, kept distinct so a
 * caller can branch on the code without showing it verbatim as text. */
async function parseErrorBody(response: Response): Promise<ParsedErrorBody> {
  try {
    const errorBody = (await response.json()) as {
      detail?: string
      error?: string
      message?: string
    }
    const code = typeof errorBody.error === 'string' ? errorBody.error : undefined
    if (typeof errorBody.detail === 'string') return { detail: errorBody.detail, code }
    if (typeof errorBody.message === 'string') return { detail: errorBody.message, code }
    return { detail: code, code }
  } catch {
    return {}
  }
}

function handleUnauthorized(auth: boolean) {
  if (auth && !AUTH_BYPASS) {
    onSessionExpired?.()
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers: customHeaders, ...init } = options

  const headers = new Headers(customHeaders)
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: resolveCredentials(auth),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401) {
    handleUnauthorized(auth)
  }

  if (!response.ok) {
    const { detail, code } = await parseErrorBody(response)
    throw new ApiError(detail ?? response.statusText, response.status, detail, code)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function apiGet<T>(path: string, auth = true, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', auth, signal })
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  auth = true,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, auth, signal })
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  auth = true,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body, auth, signal })
}

export async function apiDelete<T>(path: string, auth = true, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE', auth, signal })
}

export interface SseEvent {
  event: string
  data: unknown
}

export interface ApiStreamResponse {
  response: Response
  coverageFromHeaders: {
    total?: number
    ready?: number
    indexing?: number
  }
}

/** POST request that returns the raw Response for SSE consumption. */
export async function apiPostStream(
  path: string,
  body: unknown,
  auth = true,
  signal?: AbortSignal,
): Promise<ApiStreamResponse> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' })

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    credentials: resolveCredentials(auth),
    body: JSON.stringify(body),
    signal,
  })

  if (response.status === 401) {
    handleUnauthorized(auth)
  }

  if (!response.ok) {
    const { detail, code } = await parseErrorBody(response)
    throw new ApiError(detail ?? response.statusText, response.status, detail, code)
  }

  const parseHeaderInt = (name: string) => {
    const raw = response.headers.get(name)
    if (!raw) return undefined
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : undefined
  }

  return {
    response,
    coverageFromHeaders: {
      total: parseHeaderInt('X-Coverage-Total'),
      ready: parseHeaderInt('X-Coverage-Ready'),
      indexing: parseHeaderInt('X-Coverage-Indexing'),
    },
  }
}

/** Longest gap allowed between bytes on an SSE stream before it's treated as
 * dead. The backend sends periodic `: ping` comment lines during long-running
 * stages specifically to stay under this — every low-level read of the
 * stream (including one that only carries a `:`-prefixed keepalive comment,
 * with no `event:`/`data:` of its own) resets this timer, since it resolves
 * the pending `reader.read()` the timer is racing against. A real stall
 * (backend crash, dropped connection that never surfaces as a network
 * error) must not hang the UI forever waiting on a read that will never
 * resolve. Set well past the slowest real single-stage gap observed on the
 * accurate tier so a genuinely slow-but-alive query isn't cut off. */
const SSE_INACTIVITY_TIMEOUT_MS = 120_000

const SSE_STALLED_MESSAGE = 'The answer is taking longer than expected. Please try again.'

/** Parse SSE stream from a fetch Response body.
 *
 * `onEvent` may return `true` to declare the event terminal (the query
 * contract's `done`/`error`): reading stops there and the reader is
 * cancelled, without waiting for the server to close the socket. A stream
 * whose terminal frame has arrived is over whatever happens on the wire
 * afterwards — waiting for end-of-stream on top of it is what left the UI
 * "stuck" on a finished answer when the server stalled after `done`
 * (live, 2026-09-22). */
export async function consumeSseStream(
  response: Response,
  onEvent: (event: SseEvent) => boolean | void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new ApiError('Empty response body', 500)

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'message'

  const readWithTimeout = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const timer = setTimeout(() => {
        reader.cancel().catch(() => {})
        reject(new ApiError(SSE_STALLED_MESSAGE, 504))
      }, SSE_INACTIVITY_TIMEOUT_MS)
      reader
        .read()
        .then((result) => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch((err) => {
          clearTimeout(timer)
          reject(err)
        })
    })

  const dispatchBlock = (block: string): boolean => {
    const lines = block.split('\n')
    let eventType = currentEvent
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (dataLines.length === 0) return false

    const raw = dataLines.join('\n')
    let parsed: unknown = raw
    try {
      parsed = JSON.parse(raw)
    } catch {
      // keep as string
    }

    const terminal = onEvent({ event: eventType, data: parsed }) === true
    currentEvent = 'message'
    return terminal
  }

  while (true) {
    if (signal?.aborted) {
      await reader.cancel()
      return
    }

    const { done, value } = await readWithTimeout()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      if (block.trim() && dispatchBlock(block)) {
        await reader.cancel().catch(() => {})
        return
      }
    }
  }

  if (buffer.trim()) dispatchBlock(buffer)
}
