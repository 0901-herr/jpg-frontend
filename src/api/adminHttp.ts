import { ADMIN_API_KEY, ADMIN_API_KEY_HEADER } from '../config/admin'
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
  if (ADMIN_API_KEY) {
    headers.set(ADMIN_API_KEY_HEADER, ADMIN_API_KEY)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
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
