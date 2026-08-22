import type { AuthSession } from './types/auth'

const AUTH_STORAGE_KEY = 'docu_arch_auth'

export function getStoredAuth(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthSession) : null
  } catch {
    return null
  }
}

export function setStoredAuth(session: AuthSession): void {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredAuth(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
}

export function getAccessToken(): string | null {
  return getStoredAuth()?.accessToken ?? null
}

export function isTokenExpired(session: AuthSession): boolean {
  return Date.now() >= session.expiresAt - 30_000
}
