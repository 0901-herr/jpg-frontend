export interface CurrentUser {
  user_id: string
  username: string
  role: string
  namespaces: string[]
  auth_method: string
}

/** Session established via HttpOnly cookie or dev login tokens. */
export interface AuthSession {
  username: string
  userId: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

export interface DevLoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface VerifyTokenRequest {
  context_token: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface LdHandoffResponse {
  ok: boolean
  username: string
  root_folder_id: number
  exchange_token: string
}
