import { Spin } from 'antd'
import { Outlet } from 'react-router-dom'
import { isCitationDemoEnabled } from '../config/demo'
import { useAuth } from '../context/AuthContext'
import SessionRequiredPage from '../pages/SessionRequiredPage'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isCitationDemoEnabled()) return <Outlet />

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50">
        <Spin />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <SessionRequiredPage />
  }

  return <Outlet />
}
