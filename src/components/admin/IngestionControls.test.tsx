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
    vi.mocked(adminApi.resumeAllIngestion).mockResolvedValue({
      discovery_resumed: false,
      ingestion_resumed: false,
      bulk_started: true,
    })
  })

  it('lists discovery and ingestion controls', () => {
    renderControls()
    expect(screen.getByText('Discovery')).toBeInTheDocument()
    expect(screen.getByText('Ingestion')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Run all/i }).length).toBeGreaterThan(0)
  })

  it('calls resume ingestion API when paused', async () => {
    const user = userEvent.setup()
    renderControls(mockOverviewPaused)
    const resumeButtons = screen.getAllByRole('button', { name: /Resume/i })
    await user.click(resumeButtons[resumeButtons.length - 1]!)
    await waitFor(() => expect(adminApi.resumeIngestion).toHaveBeenCalled())
  })

  it('calls run all API', async () => {
    const user = userEvent.setup()
    renderControls()
    await user.click(screen.getByRole('button', { name: /Run all/i }))
    await waitFor(() => expect(adminApi.resumeAllIngestion).toHaveBeenCalled())
  })
})
