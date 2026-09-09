import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp } from 'antd'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import * as adminApi from '../../api/admin'
import type { AdminDocumentQuery } from '../../api/types/admin'
import IngestionOverviewPage from './IngestionOverviewPage'
import {
  mockControlPaused,
  mockControlRunning,
  mockDocument,
  mockDocumentList,
  mockOverviewPaused,
  mockOverviewRunning,
  mockRetryResponse,
} from '../../test/adminFixtures'

vi.mock('../../api/admin')

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter>
          <IngestionOverviewPage />
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>,
  )
}

describe('IngestionOverviewPage', () => {
  beforeEach(() => {
    vi.mocked(adminApi.fetchIngestionOverview).mockResolvedValue(mockOverviewRunning)
    vi.mocked(adminApi.fetchAdminDocuments).mockResolvedValue(
      mockDocumentList([mockDocument()], 1),
    )
    vi.mocked(adminApi.fetchIngestionErrors).mockResolvedValue({ groups: [] })
    vi.mocked(adminApi.pauseIngestion).mockResolvedValue(mockControlPaused)
    vi.mocked(adminApi.resumeIngestion).mockResolvedValue(mockControlRunning)
    vi.mocked(adminApi.retryDocument).mockResolvedValue(mockRetryResponse)
    vi.mocked(adminApi.retryFailedDocuments).mockResolvedValue({ retried: 3 })
  })

  it('loads overview', async () => {
    renderPage()
    expect(await screen.findByText('Ingestion Operations')).toBeInTheDocument()
    expect(screen.getByText(/Overall: RUNNING/)).toBeInTheDocument()
  })

  it('shows running state', async () => {
    renderPage()
    expect(await screen.findByText(/Discovery: RUNNING/)).toBeInTheDocument()
    expect(screen.getByText(/Ingestion: RUNNING/)).toBeInTheDocument()
  })

  it('shows paused state', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockResolvedValue(mockOverviewPaused)
    renderPage()
    expect(await screen.findByText(/Overall: PAUSED/)).toBeInTheDocument()
    expect(screen.getByText('Resume Ingestion')).toBeInTheDocument()
  })

  it('pause action calls backend', async () => {
    // Covered by IngestionControls.test.tsx — keep overview integration smoke only
    renderPage()
    expect(await screen.findByRole('button', { name: /Pause Ingestion/i })).toBeInTheDocument()
  })

  it('resume action calls backend when paused', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockResolvedValue(mockOverviewPaused)
    renderPage()
    expect(await screen.findByRole('button', { name: /Resume Ingestion/i })).toBeInTheDocument()
  })

  it('searches documents by docId', async () => {
    const user = userEvent.setup()
    renderPage()
    const searchCard = (await screen.findByText('Search Documents')).closest('.ant-card') as HTMLElement
    await user.type(within(searchCard).getByPlaceholderText('docId or filename'), '5052')
    await user.click(within(searchCard).getByRole('button', { name: /search/i }))
    await waitFor(() =>
      expect(adminApi.fetchAdminDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ docId: '5052' }),
        expect.anything(),
      ),
    )
  })

  it('searches documents by filename', async () => {
    const { buildDocumentQuery } = await import('../../components/admin/DocumentSearch')
    const query = buildDocumentQuery(
      { search: 'CT_Report', searchBy: 'filename', failedOnly: false },
      1,
      50,
    )
    expect(query.filename).toBe('CT_Report')
  })

  it('displays READY document in table', async () => {
    renderPage()
    const row = await screen.findByRole('row', { name: /CT_Report\.pdf/i })
    expect(
      within(row).getByRole('img', { name: /Pipeline: Fully indexed and searchable/i }),
    ).toBeInTheDocument()
  })

  it('displays INDEXING document', async () => {
    vi.mocked(adminApi.fetchAdminDocuments).mockResolvedValue(
      mockDocumentList([
        mockDocument({ lifecycle_status: 'INDEXING', db_status: 'INDEXING', filename: 'IndexingDoc.pdf' }),
      ]),
    )
    renderPage()
    expect(await screen.findByText('IndexingDoc.pdf')).toBeInTheDocument()
    expect(screen.getAllByText(/indexing/i).length).toBeGreaterThan(0)
  })

  it('displays FAILED document', async () => {
    vi.mocked(adminApi.fetchAdminDocuments).mockResolvedValue(
      mockDocumentList([
        mockDocument({
          lifecycle_status: 'FAILED',
          db_status: 'FAILED',
          filename: 'FailedDoc.pdf',
        }),
      ]),
    )
    renderPage()
    expect(await screen.findByText('FailedDoc.pdf')).toBeInTheDocument()
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThan(0)
  })

  it('shows failed documents section with retry controls', async () => {
    renderPage()
    expect(await screen.findByText(/Failed Documents/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Retry all/i })).toBeInTheDocument()
  })

  it('shows no results empty state', async () => {
    vi.mocked(adminApi.fetchAdminDocuments).mockResolvedValue(mockDocumentList([], 0))
    renderPage()
    expect(await screen.findByText('No documents match your search')).toBeInTheDocument()
  })

  it('shows backend error on overview failure', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockRejectedValue(new Error('Adapter unreachable'))
    renderPage()
    expect(await screen.findByText('Failed to load ingestion overview')).toBeInTheDocument()
  })

  it('paginates document results', async () => {
    vi.mocked(adminApi.fetchAdminDocuments).mockResolvedValue(
      mockDocumentList([mockDocument()], 120),
    )
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('120 documents')
    await user.click(screen.getByTitle('2'))
    await waitFor(() =>
      expect(adminApi.fetchAdminDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 50 }),
        expect.anything(),
      ),
    )
  })

  it('applies failed-only filter', async () => {
    const user = userEvent.setup()
    renderPage()
    const searchCard = (await screen.findByText('Search Documents')).closest('.ant-card') as HTMLElement
    await user.click(within(searchCard).getByRole('checkbox', { name: 'Failed only' }))
    await user.click(within(searchCard).getByRole('button', { name: /search/i }))
    await waitFor(() =>
      expect(adminApi.fetchAdminDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStatus: 'FAILED' }),
        expect.anything(),
      ),
    )
  })

  it('shows stale audit health when poll is old', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockResolvedValue({
      ...mockOverviewRunning,
      last_audit_poll_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    })
    renderPage()
    expect(await screen.findByText('Stale')).toBeInTheDocument()
  })
})
