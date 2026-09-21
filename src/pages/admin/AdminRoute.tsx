import { Alert, Result, Spin } from 'antd'
import { Navigate, Outlet } from 'react-router-dom'
import { ApiError } from '../../api/http'
import { ADMIN_API_KEY, isAdminConfigured } from '../../config/admin'
import { useQuery } from '@tanstack/react-query'
import { fetchIngestionOverview } from '../../api/admin'
import { adminQueryKeys } from '../../lib/adminQueryKeys'

export function AdminRoute() {
  if (!isAdminConfigured()) {
    return (
      <Result
        status="403"
        title="Admin not configured"
        subTitle="The admin dashboard is not configured for this deployment."
      />
    )
  }

  return <AdminAuthGate />
}

function AdminAuthGate() {
  const authCheck = useQuery({
    queryKey: [...adminQueryKeys.overview, 'auth-check'],
    queryFn: ({ signal }) => fetchIngestionOverview(signal),
    retry: false,
    staleTime: 60_000,
  })

  if (authCheck.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (authCheck.isError) {
    const err = authCheck.error
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return (
        <div className="max-w-lg mx-auto mt-16 p-6">
          <Alert
            type="error"
            showIcon
            title="Admin authorization failed"
            description={
              ADMIN_API_KEY
                ? 'The admin API key was rejected. Contact your administrator.'
                : 'Admin access is not configured. Contact your administrator.'
            }
          />
        </div>
      )
    }
    if (err instanceof ApiError && err.status === 503) {
      return (
        <Result
          status="error"
          title="Admin API unavailable"
          subTitle={err.detail ?? 'Backend admin API is not configured.'}
        />
      )
    }
    return (
      <Result
        status="error"
        title="Cannot reach adapter"
        subTitle={(err as Error).message}
      />
    )
  }

  return <Outlet />
}

export function AdminIndexRedirect() {
  return <Navigate to="/admin/ingestion" replace />
}
