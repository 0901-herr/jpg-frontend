import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ApiError } from '../../api/http'
import * as adminApi from '../../api/admin'
import { AdminRoute } from './AdminRoute'

vi.mock('../../api/admin')

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
  it('shows authorization failure for 401', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockRejectedValue(
      new ApiError('Invalid API key', 401, 'Invalid API key'),
    )
    renderAdminRoute()
    expect(await screen.findByText('Admin authorization failed')).toBeInTheDocument()
  })
})
