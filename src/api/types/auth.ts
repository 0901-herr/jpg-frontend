export interface CurrentUser {
  user_id: string
  username: string
  role: string
  namespaces: string[]
  auth_method: string
}

/** Session established via HttpOnly cookie. */
export interface AuthSession {
  username: string
  userId: string
}

export interface LdHandoffResponse {
  ok: boolean
  username: string
  root_folder_id: number
  exchange_token: string
}
