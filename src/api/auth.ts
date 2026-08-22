import { apiGet, apiPost } from './http'
import { setStoredAuth } from './tokenStorage'
import type {
  AuthSession,
  CurrentUser,
  DevLoginRequest,
  TokenResponse,
  VerifyTokenRequest,
} from './types/auth'

function toSession(tokens: TokenResponse, user: CurrentUser): AuthSession {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    username: user.username || user.user_id,
    userId: user.user_id,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
}

async function establishSession(tokens: TokenResponse): Promise<AuthSession> {
  setStoredAuth({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    username: '',
    userId: '',
    expiresAt: Date.now() + tokens.expires_in * 1000,
  })

  const user = await getCurrentUser()
  const session = toSession(tokens, user)
  setStoredAuth(session)
  return session
}

/** Dev-only username/password login (POST /auth/login). */
export async function devLogin(username: string, password: string): Promise<AuthSession> {
  const tokens = await apiPost<TokenResponse>(
    '/auth/login',
    { username, password } satisfies DevLoginRequest,
    false,
  )
  return establishSession(tokens)
}

/** Exchange a LogicalDOC context token for JWT tokens, then fetch user profile. */
export async function verifyToken(contextToken: string): Promise<AuthSession> {
  const tokens = await apiPost<TokenResponse>(
    '/auth/verify-token',
    { context_token: contextToken } satisfies VerifyTokenRequest,
    false,
  )
  return establishSession(tokens)
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>('/auth/me')
}

export async function logout(): Promise<void> {
  try {
    await apiPost('/auth/logout')
  } catch {
    // clear local session even if backend call fails
  }
}
