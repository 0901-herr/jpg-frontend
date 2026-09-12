const AUTH_STORAGE_KEY = 'docu_arch_auth'

export function clearStoredAuth(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
}
