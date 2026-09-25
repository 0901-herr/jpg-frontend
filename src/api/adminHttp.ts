import { ApiError } from './http'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

interface AdminRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

async function parseErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const errorBody = (await response.json()) as { detail?: string }
    return typeof errorBody.detail === 'string' ? errorBody.detail : undefined
  } catch {
    return undefined
  }
}

export async function adminRequest<T>(
  path: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  const { body, headers: customHeaders, ...init } = options
  const headers = new Headers(customHeaders)
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  // Admin access is authorized server-side by the same `ai_session` cookie
  // the chat API already sends — no client-held key. See config/admin.ts.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const detail = await parseErrorDetail(response)
    throw new ApiError(detail ?? response.statusText, response.status, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function adminGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return adminRequest<T>(path, { method: 'GET', signal })
}

export function adminPost<T>(path: string, signal?: AbortSignal): Promise<T> {
  return adminRequest<T>(path, { method: 'POST', signal })
}

export function adminPatch<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return adminRequest<T>(path, { method: 'PATCH', body, signal })
}
