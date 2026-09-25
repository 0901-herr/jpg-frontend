import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AdminRoute } from './AdminRoute'

const useAuthMock = vi.fn()
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

function renderAdminRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminRoute', () => {
  it('shows a spinner while the session is loading', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: true, session: null })
    const { container } = renderAdminRoute()
    expect(container.querySelector('.ant-spin')).toBeInTheDocument()
  })

  it('shows the sign-in page when there is no session', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false, session: null })
    renderAdminRoute()
    expect(screen.getByText('Sign in required')).toBeInTheDocument()
  })

  it('shows a friendly not-an-admin state for a logged-in non-admin session', () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: { username: 'bob', userId: '1', isAdmin: false },
    })
    renderAdminRoute()
    expect(screen.getByText('Not an admin')).toBeInTheDocument()
  })

  it('renders the outlet for an allow-listed admin session', () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: { username: 'admin', userId: '1', isAdmin: true },
    })
    renderAdminRoute()
    expect(screen.queryByText('Not an admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign in required')).not.toBeInTheDocument()
  })
})
