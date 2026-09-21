import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp } from 'antd'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import * as adminApi from '../../api/admin'
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

function renderPage(initialRoute = '/admin/ingestion?tab=documents') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/admin/ingestion" element={<IngestionOverviewPage />} />
          </Routes>
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
    renderPage('/admin/ingestion?tab=overview')
    expect(await screen.findByText('Pipeline progress')).toBeInTheDocument()
  })

  it('shows running state', async () => {
    renderPage('/admin/ingestion?tab=overview')
    expect(await screen.findAllByText('Running')).toHaveLength(2)
  })

  it('shows paused state', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockResolvedValue(mockOverviewPaused)
    renderPage('/admin/ingestion?tab=overview')
    expect(await screen.findAllByText('Paused')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Resume discovery|Resume ingestion/i }).length).toBeGreaterThan(0)
  })

  it('pause action calls backend', async () => {
    renderPage('/admin/ingestion?tab=overview')
    expect(await screen.findByText('Pipeline progress')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Pause discovery|Pause ingestion/i }).length).toBeGreaterThan(0)
  })

  it('resume action calls backend when paused', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockResolvedValue(mockOverviewPaused)
    renderPage('/admin/ingestion?tab=overview')
    expect(await screen.findByText('Pipeline progress')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Resume discovery|Resume ingestion/i }).length).toBeGreaterThan(0)
  })

  it('searches documents by docId', async () => {
    const user = userEvent.setup()
    renderPage()
    const searchForm = (await screen.findByPlaceholderText('LogicalDOC ID or filename')).closest(
      'form',
    ) as HTMLElement
    await user.type(
      within(searchForm).getByPlaceholderText('LogicalDOC ID or filename'),
      '5052{enter}',
    )
    await waitFor(() =>
      expect(adminApi.fetchAdminDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ docId: '5052' }),
        expect.anything(),
      ),
    )
  })

  it('keeps document search unboxed and removes ingestion actions', async () => {
    renderPage()
    const search = await screen.findByPlaceholderText('LogicalDOC ID or filename')
    expect(search.closest('form')).toBeInTheDocument()
    expect(search.closest('.ant-card')).not.toBeInTheDocument()
    expect(screen.queryByText('Pipeline progress')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Re-ingest missing classification/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Documents' })).not.toBeInTheDocument()
  })

  it('searches documents by filename', async () => {
    const { buildDocumentQuery } = await import('../../components/admin/DocumentSearch')
    const query = buildDocumentQuery(
      { search: 'CT_Report', failedOnly: false },
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
    renderPage('/admin/ingestion?tab=errors')
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
    await screen.findByPlaceholderText('LogicalDOC ID or filename')
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const filterPanel = await screen.findByText('Filter documents')
    const panel = filterPanel.closest('.admin-filter-popover') ?? filterPanel.parentElement
    expect(panel).toBeTruthy()
    await user.click(within(panel as HTMLElement).getByRole('checkbox', { name: 'Failed only' }))
    await user.click(within(panel as HTMLElement).getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(adminApi.fetchAdminDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleStatus: 'FAILED' }),
        expect.anything(),
      ),
    )
  }, 15_000)

  it('shows service ports on the system tab', async () => {
    renderPage('/admin/ingestion?tab=system')
    expect(await screen.findByText('localhost:8001')).toBeInTheDocument()
    expect(screen.getByText('localhost:8082')).toBeInTheDocument()
    expect(screen.getByText('rag.example:8080')).toBeInTheDocument()
  })

  it('shows stale audit health when poll is old', async () => {
    vi.mocked(adminApi.fetchIngestionOverview).mockResolvedValue({
      ...mockOverviewRunning,
      last_audit_poll_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    })
    renderPage('/admin/ingestion?tab=system')
    expect(await screen.findByText('Stale')).toBeInTheDocument()
  })
})
