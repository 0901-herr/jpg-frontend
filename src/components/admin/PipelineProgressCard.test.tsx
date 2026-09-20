import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import PipelineProgressCard from './PipelineProgressCard'
import { mockOverviewIdle, mockOverviewPaused, mockOverviewRunning } from '../../test/adminFixtures'

vi.mock('../../api/admin', () => ({
  pausePipeline: vi.fn(),
  resumeAllIngestion: vi.fn(),
}))

function renderCard(overview = mockOverviewRunning) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <PipelineProgressCard
          overview={overview}
          dataUpdatedAt={Date.now() - 5_000}
          onRefresh={() => undefined}
        />
      </AntApp>
    </QueryClientProvider>,
  )
}

describe('PipelineProgressCard', () => {
  it('combines status, progress counts, and auto-refresh meta', () => {
    renderCard()
    expect(screen.getByText('Pipeline progress')).toBeInTheDocument()
    expect(screen.getByText('Discovered')).toBeInTheDocument()
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByText('Queue')).toBeInTheDocument()
    expect(screen.getByText('Discovered from LogicalDOC')).toBeInTheDocument()
    expect(screen.getByText('Ready for indexing')).toBeInTheDocument()
    expect(screen.getAllByText('Indexing').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Waiting for RAG')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting to prepare')).not.toBeInTheDocument()
    expect(screen.getByText(/^Last update /)).toBeInTheDocument()
    expect(screen.queryByText(/Auto-refreshes/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument()
  })

  it('shows a static section intro instead of live status copy', () => {
    renderCard()
    expect(
      screen.getByText(/Documents being prepared for AI search\. Press start to begin/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/waiting to be scheduled/i)).not.toBeInTheDocument()
  })

  it('explains when indexing capacity is applying backpressure', () => {
    renderCard({
      ...mockOverviewRunning,
      bulk_progress: {
        ...mockOverviewRunning.bulk_progress!,
        current_inflight: 80,
        submission_backpressured: true,
      },
    })

    expect(screen.getByText('80 / 80')).toBeInTheDocument()
    expect(screen.getByText(/Indexing is at capacity/)).toBeInTheDocument()
  })

  it('explains the LogicalDOC backlog on hover', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.hover(screen.getByText('Discovered from LogicalDOC'))

    expect(
      await screen.findByText(/Found in LogicalDOC and still being prepared locally/),
    ).toBeInTheDocument()
  })

  it('explains the ready-for-indexing queue on hover', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.hover(screen.getByText('Ready for indexing'))

    expect(
      await screen.findByText(/Prepared and waiting to be sent for indexing/),
    ).toBeInTheDocument()
  })

  it('still renders against an older adapter without capacity fields', () => {
    const legacyBulk = { ...mockOverviewRunning.bulk_progress! }
    delete legacyBulk.current_inflight
    delete legacyBulk.target_inflight
    delete legacyBulk.preparing_capacity
    delete legacyBulk.preparing_resume_threshold
    delete legacyBulk.staged_capacity
    delete legacyBulk.staged_resume_threshold
    delete legacyBulk.discovery_backpressured
    delete legacyBulk.preparation_backpressured
    delete legacyBulk.submission_backpressured

    renderCard({ ...mockOverviewRunning, bulk_progress: legacyBulk })

    expect(screen.getByText('Pipeline progress')).toBeInTheDocument()
    expect(screen.queryByText('Queue')).not.toBeInTheDocument()
  })

  it('shows pause control while work is active', () => {
    renderCard()
    expect(screen.getByRole('button', { name: /Pause pipeline/i })).toBeInTheDocument()
  })

  it('shows resume control when gates are paused', () => {
    renderCard(mockOverviewPaused)
    expect(screen.getByRole('button', { name: /Resume pipeline/i })).toBeInTheDocument()
  })

  it('shows start control when idle', () => {
    renderCard(mockOverviewIdle)
    expect(screen.getByRole('button', { name: /Start ingesting/i })).toBeInTheDocument()
  })

  it('does not show empty progress copy when nothing is ready yet', () => {
    renderCard({
      ...mockOverviewRunning,
      bulk_progress: {
        ...mockOverviewRunning.bulk_progress!,
        job_state: 'completed',
        traversal_status: 'completed',
        total_discovered: 0,
      },
      counts: {
        ...mockOverviewRunning.counts,
        discovered: 20,
        ready: 0,
        preparing: 0,
        staged: 0,
        indexing: 0,
      },
    })
    expect(
      screen.getByText(/Documents being prepared for AI search\. Press start to begin/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No documents discovered yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Scanning page/i)).not.toBeInTheDocument()
  })
})
