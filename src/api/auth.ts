import { apiGet, apiPost } from './http'
import { clearStoredAuth, getStoredAuth, setStoredAuth } from './tokenStorage'
import type {
  AuthSession,
  CurrentUser,
  DevLoginRequest,
  TokenResponse,
  VerifyTokenRequest,
} from './types/auth'

function toSession(user: CurrentUser): AuthSession {
  return {
    username: user.username || user.user_id,
    userId: user.user_id,
  }
}

function toTokenSession(tokens: TokenResponse, user: CurrentUser): AuthSession {
  return {
    ...toSession(user),
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
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

/** Dev-only username/password login (POST /auth/login). */
export async function devLogin(username: string, password: string): Promise<AuthSession> {
  const tokens = await apiPost<TokenResponse>(
    '/auth/login',
    { username, password } satisfies DevLoginRequest,
    false,
  )

  setStoredAuth({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    username: '',
    userId: '',
    expiresAt: Date.now() + tokens.expires_in * 1000,
  })

  const user = await getCurrentUser()
  const session = toTokenSession(tokens, user)
  setStoredAuth(session)
  return session
}

/** Exchange a LogicalDOC context token for JWT tokens, then fetch user profile. */
export async function verifyToken(contextToken: string): Promise<AuthSession> {
  const tokens = await apiPost<TokenResponse>(
    '/auth/verify-token',
    { context_token: contextToken } satisfies VerifyTokenRequest,
    false,
  )

  setStoredAuth({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    username: '',
    userId: '',
    expiresAt: Date.now() + tokens.expires_in * 1000,
  })

  const user = await getCurrentUser()
  const session = toTokenSession(tokens, user)
  setStoredAuth(session)
  return session
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

export function getLocalSession(): AuthSession | null {
  return getStoredAuth()
}
