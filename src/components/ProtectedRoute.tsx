import { Navigate, Outlet } from 'react-router-dom'
import { AUTH_BYPASS } from '../config/auth'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  if (AUTH_BYPASS) return <Outlet />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export function PublicRoute() {
  const { isAuthenticated } = useAuth()
  if (AUTH_BYPASS) return <Navigate to="/" replace />
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
