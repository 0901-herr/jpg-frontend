import { Result, Spin } from 'antd'
import { Navigate, Outlet } from 'react-router-dom'
import { ADMIN_MOCK } from '../../config/admin'
import { useAuth } from '../../context/AuthContext'
import SessionRequiredPage from '../SessionRequiredPage'

export function AdminRoute() {
  const { isAuthenticated, isLoading, session } = useAuth()

  // Dev convenience: the admin dashboard can be served entirely from an
  // in-memory mock with no backend running at all (see config/admin.ts).
  // Real `/api/admin/*` calls still enforce access server-side in every
  // other mode (jpg-adapter's `require_admin`) — this route gate is UX
  // only, never the trust boundary.
  if (ADMIN_MOCK) return <Outlet />

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <SessionRequiredPage />
  }

  if (!session?.isAdmin) {
    return (
      <Result
        status="403"
        title="Not an admin"
        subTitle="Your LogicalDOC account doesn't have admin access to Arche AI. Contact your administrator if you believe this is a mistake."
      />
    )
  }

  return <Outlet />
}

export function AdminIndexRedirect() {
  return <Navigate to="/admin/ingestion" replace />
}
