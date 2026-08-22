import { clearStoredAuth, getAccessToken, getStoredAuth, setStoredAuth } from './tokenStorage'
import type { AuthSession } from './types/auth'
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

let refreshPromise: Promise<AuthSession | null> | null = null

async function refreshSession(refreshToken: string): Promise<AuthSession | null> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!response.ok) {
    clearStoredAuth()
    return null
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const existing = getStoredAuth()
  if (!existing) return null

  const session: AuthSession = {
    ...existing,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  setStoredAuth(session)
  return session
}

async function getValidAccessToken(): Promise<string | null> {
  const session = getStoredAuth()
  if (!session) return null

  if (!isSessionExpired(session)) {
    return session.accessToken
  }

  if (!refreshPromise) {
    refreshPromise = refreshSession(session.refreshToken).finally(() => {
      refreshPromise = null
    })
  }

  const refreshed = await refreshPromise
  return refreshed?.accessToken ?? null
}

function isSessionExpired(session: AuthSession): boolean {
  return Date.now() >= session.expiresAt - 30_000
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers: customHeaders, ...init } = options

  const headers = new Headers(customHeaders)
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth && !AUTH_BYPASS) {
    const token = await getValidAccessToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401 && auth && !AUTH_BYPASS) {
    clearStoredAuth()
  }

  if (!response.ok) {
    let detail: string | undefined
    try {
      const errorBody = (await response.json()) as { detail?: string }
      detail = typeof errorBody.detail === 'string' ? errorBody.detail : undefined
    } catch {
      // ignore parse errors
    }
    throw new ApiError(detail ?? response.statusText, response.status, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function apiFetchBlob(path: string, auth = true): Promise<Blob> {
  const headers = new Headers()
  if (auth && !AUTH_BYPASS) {
    const token = await getValidAccessToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { headers })

  if (response.status === 401 && auth && !AUTH_BYPASS) {
    clearStoredAuth()
  }

  if (!response.ok) {
    let detail: string | undefined
    try {
      const errorBody = (await response.json()) as { detail?: string }
      detail = typeof errorBody.detail === 'string' ? errorBody.detail : undefined
    } catch {
      // ignore parse errors
    }
    throw new ApiError(detail ?? response.statusText, response.status, detail)
  }

  return response.blob()
}

export async function apiGet<T>(path: string, auth = true): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', auth })
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  auth = true,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, auth, signal })
}

export { getAccessToken, getStoredAuth, setStoredAuth, clearStoredAuth }
