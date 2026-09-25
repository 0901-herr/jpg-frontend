export interface CurrentUser {
  user_id: string
  username: string
  role: string
  namespaces: string[]
  auth_method: string
  /** Whether this LogicalDOC session is on the adapter's admin allow-list
   * (`ADAPTER_ADMIN_LOGICALDOC_USERNAMES`). UI-only convenience — every
   * `/api/admin/*` call is still independently authorized server-side. */
  is_admin: boolean
}

/** Session established via HttpOnly cookie. */
export interface AuthSession {
  username: string
  userId: string
  isAdmin: boolean
}

export interface LdHandoffResponse {
  ok: boolean
  username: string
  root_folder_id: number
  exchange_token: string
}
