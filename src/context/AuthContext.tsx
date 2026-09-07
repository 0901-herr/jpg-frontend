import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { checkCookieSession, logout as apiLogout } from '../api/auth'
import { setSessionExpiredHandler } from '../api/http'
import { clearStoredAuth } from '../api/tokenStorage'
import type { AuthSession } from '../api/types/auth'
import { AUTH_BYPASS, DEV_USER } from '../config/auth'
import { queryClient } from '../lib/queryClient'

interface AuthContextValue {
  session: AuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  sessionExpired: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function bypassSession(): AuthSession {
  return {
    username: DEV_USER.username,
    userId: DEV_USER.userId,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    if (AUTH_BYPASS) {
      clearStoredAuth()
      return bypassSession()
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(!AUTH_BYPASS)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    if (AUTH_BYPASS) return

    setSessionExpiredHandler(() => {
      clearStoredAuth()
      setSession(null)
      setSessionExpired(true)
      queryClient.clear()
    })

    let cancelled = false
    ;(async () => {
      const cookieSession = await checkCookieSession()
      if (cancelled) return
      setSession(cookieSession)
      setIsLoading(false)
    })()

    return () => {
      cancelled = true
      setSessionExpiredHandler(null)
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
      setSessionExpired(false)
      queryClient.clear()
      setIsLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      session: AUTH_BYPASS ? bypassSession() : session,
      isAuthenticated: AUTH_BYPASS || session !== null,
      isLoading,
      sessionExpired,
      logout,
    }),
    [session, isLoading, sessionExpired, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
