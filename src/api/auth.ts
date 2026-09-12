import { apiGet, apiPost } from './http'
import { clearStoredAuth } from './tokenStorage'
import type { AuthSession, CurrentUser } from './types/auth'

function toSession(user: CurrentUser): AuthSession {
  return {
    username: user.username || user.user_id,
    userId: user.user_id,
  }
}

/** Check cookie session via GET /auth/me. Returns null if unauthenticated. */
export async function checkCookieSession(): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/auth/me`, {
      credentials: 'include',
    })
    if (!response.ok) return null
    const user = (await response.json()) as CurrentUser
    return toSession(user)
  } catch {
    return null
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>('/auth/me')
}

export async function logout(): Promise<void> {
  try {
    await apiPost('/auth/logout')
  } catch {
    // clear local session even if backend call fails
  } finally {
    clearStoredAuth()
  }
}
