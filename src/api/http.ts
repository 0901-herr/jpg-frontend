import { AUTH_BYPASS } from '../config/auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  status: number
  detail?: string

  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
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

async function parseErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const errorBody = (await response.json()) as { detail?: string; error?: string }
    if (typeof errorBody.detail === 'string') return errorBody.detail
    if (typeof errorBody.error === 'string') return errorBody.error
    return undefined
  } catch {
    return undefined
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
    const detail = await parseErrorDetail(response)
    throw new ApiError(detail ?? response.statusText, response.status, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function apiFetchBlob(path: string, auth = true): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: resolveCredentials(auth),
  })

  if (response.status === 401) {
    handleUnauthorized(auth)
  }

  if (!response.ok) {
    const detail = await parseErrorDetail(response)
    throw new ApiError(detail ?? response.statusText, response.status, detail)
  }

  return response.blob()
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
    const detail = await parseErrorDetail(response)
    throw new ApiError(detail ?? response.statusText, response.status, detail)
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

/** Parse SSE stream from a fetch Response body. */
export async function consumeSseStream(
  response: Response,
  onEvent: (event: SseEvent) => void,
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

  const dispatchBlock = (block: string) => {
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

    if (dataLines.length === 0) return

    const raw = dataLines.join('\n')
    let parsed: unknown = raw
    try {
      parsed = JSON.parse(raw)
    } catch {
      // keep as string
    }

    onEvent({ event: eventType, data: parsed })
    currentEvent = 'message'
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
      if (block.trim()) dispatchBlock(block)
    }
  }

  if (buffer.trim()) dispatchBlock(buffer)
}
