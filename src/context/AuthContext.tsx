import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { devLogin, logout as apiLogout } from '../api/auth'
import { clearStoredAuth, getStoredAuth } from '../api/tokenStorage'
import type { AuthSession } from '../api/types/auth'
import { AUTH_BYPASS, DEV_USER } from '../config/auth'
import { queryClient, queryKeys } from '../lib/queryClient'

interface AuthContextValue {
  session: AuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function bypassSession(): AuthSession {
  return {
    accessToken: '',
    refreshToken: '',
    username: DEV_USER.username,
    userId: DEV_USER.userId,
    expiresAt: Number.MAX_SAFE_INTEGER,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    if (AUTH_BYPASS) {
      clearStoredAuth()
      return bypassSession()
    }
    return getStoredAuth()
  })
  const [isLoading, setIsLoading] = useState(false)

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true)
    try {
      const authSession = await devLogin(username, password)
      setSession(authSession)
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentUser })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    if (AUTH_BYPASS) return
    setIsLoading(true)
    try {
      await apiLogout()
    } finally {
      clearStoredAuth()
      setSession(null)
      queryClient.clear()
      setIsLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      session: AUTH_BYPASS ? bypassSession() : session,
      isAuthenticated: AUTH_BYPASS || session !== null,
      isLoading,
      login,
      logout,
    }),
    [session, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
