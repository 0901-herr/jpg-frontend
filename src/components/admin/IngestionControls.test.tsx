import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp } from 'antd'
import React from 'react'
import { vi } from 'vitest'
import * as adminApi from '../../api/admin'
import IngestionControls from '../../components/admin/IngestionControls'
import {
  mockControlPaused,
  mockControlRunning,
  mockOverviewPaused,
  mockOverviewRunning,
} from '../../test/adminFixtures'

vi.mock('../../api/admin')

function renderControls(overview = mockOverviewRunning) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <IngestionControls overview={overview} />
      </AntApp>
    </QueryClientProvider>,
  )
}

describe('IngestionControls', () => {
  beforeEach(() => {
    vi.mocked(adminApi.pauseIngestion).mockResolvedValue(mockControlPaused)
    vi.mocked(adminApi.resumeIngestion).mockResolvedValue(mockControlRunning)
  })

  it('lists grouped control sections', () => {
    renderControls()
    expect(screen.getByText('Pipeline gates')).toBeInTheDocument()
    expect(screen.getByText('Change detection')).toBeInTheDocument()
    expect(screen.queryByText('Initial corpus')).not.toBeInTheDocument()
    expect(screen.queryByText('Bulk crawl')).not.toBeInTheDocument()
    // Maintenance card was removed as a duplicate — retrying failed
    // documents lives on the Failures tab and classification lives on
    // Documents (dashboard cleanup pass).
    expect(screen.queryByText('Maintenance')).not.toBeInTheDocument()
    expect(screen.getByText('Operator')).toBeInTheDocument()
    expect(screen.getByText('Audit changelog')).toBeInTheDocument()
    expect(screen.getByText('Reconciliation')).toBeInTheDocument()
  })

  it('calls resume ingestion API when paused', async () => {
    const user = userEvent.setup()
    renderControls(mockOverviewPaused)
    await user.click(screen.getByRole('button', { name: /Resume ingestion/i }))
    await waitFor(() => expect(adminApi.resumeIngestion).toHaveBeenCalled())
  })

  it('uses the shared centered confirmation before pausing ingestion', async () => {
    const user = userEvent.setup()
    renderControls()

    await user.click(screen.getByRole('button', { name: 'Pause ingestion' }))

    expect(screen.getByRole('dialog')).toHaveClass('admin-confirm-modal')
    expect(screen.getByText('Pause ingestion?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(adminApi.pauseIngestion).toHaveBeenCalledOnce())
  })

  it('names the operator link "ARCHE AI session", not the old "AI chat session" copy', () => {
    renderControls()
    expect(screen.getByText('ARCHE AI session')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open ARCHE AI session' })).toBeInTheDocument()
    expect(screen.queryByText(/AI chat session/i)).not.toBeInTheDocument()
  })
})
