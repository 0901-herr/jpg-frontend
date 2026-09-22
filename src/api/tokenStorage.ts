const AUTH_STORAGE_KEY = 'docu_arch_auth'

export function clearStoredAuth(): void {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // Session storage can be disabled by browser privacy settings. Auth is
    // cookie-backed, so clearing this optional legacy key must stay best
    // effort and never mask logout/session-expiry handling.
  }
}
