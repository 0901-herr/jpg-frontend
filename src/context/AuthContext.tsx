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
  signedOut: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function bypassSession(): AuthSession {
  return {
    username: DEV_USER.username,
    userId: DEV_USER.userId,
    // Chat-only dev bypass — not an admin grant. Use VITE_ADMIN_MOCK to
    // work on the admin dashboard with no backend (see config/admin.ts).
    isAdmin: false,
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
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    if (AUTH_BYPASS) return

    setSessionExpiredHandler(() => {
      clearStoredAuth()
      setSession(null)
      setSessionExpired(true)
      setSignedOut(false)
      queryClient.clear()
    })

    let cancelled = false
    ;(async () => {
      const cookieSession = await checkCookieSession()
      if (cancelled) return
      setSession(cookieSession)
      if (cookieSession) {
        setSessionExpired(false)
        setSignedOut(false)
      }
      setIsLoading(false)
    })()

    return () => {
      cancelled = true
      setSessionExpiredHandler(null)
    }
  }, [])

  const logout = useCallback(async () => {
    setIsLoading(true)
    try {
      if (!AUTH_BYPASS) {
        await apiLogout()
      }
    } finally {
      clearStoredAuth()
      setSession(null)
      setSessionExpired(false)
      setSignedOut(true)
      queryClient.clear()
      setIsLoading(false)
    }
  }, [])

  const value = useMemo(() => {
    const activeSession = AUTH_BYPASS && !signedOut ? bypassSession() : session
    return {
      session: activeSession,
      isAuthenticated: activeSession !== null,
      isLoading,
      sessionExpired,
      signedOut,
      logout,
    }
  }, [session, isLoading, sessionExpired, signedOut, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
