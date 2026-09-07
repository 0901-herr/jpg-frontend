import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp } from 'antd'
import React from 'react'
import { vi } from 'vitest'
import * as adminApi from '../../api/admin'
import IngestionControls from '../../components/admin/IngestionControls'
import { mockControlPaused, mockControlRunning, mockOverviewPaused, mockOverviewRunning } from '../../test/adminFixtures'

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

  it('shows pause control for running ingestion', () => {
    renderControls()
    expect(screen.getByRole('button', { name: /Pause Ingestion/i })).toBeInTheDocument()
  })

  it('calls resume ingestion API when paused', async () => {
    const user = userEvent.setup()
    renderControls(mockOverviewPaused)
    await user.click(screen.getByRole('button', { name: /Resume Ingestion/i }))
    await waitFor(() => expect(adminApi.resumeIngestion).toHaveBeenCalled())
  })
})
