export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface DevLoginRequest {
  username: string
  password: string
}

export interface VerifyTokenRequest {
  context_token: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface CurrentUser {
  user_id: string
  username: string
  role: string
  namespaces: string[]
  auth_method: string
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  username: string
  userId: string
  expiresAt: number
}
