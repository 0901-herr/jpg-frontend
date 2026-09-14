import { describe, expect, it, vi } from 'vitest'
import { fetchBrowseCategories, fetchDocumentSummary } from './browse'
import { apiGet, apiPost } from './http'

vi.mock('./http', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

describe('fetchBrowseCategories', () => {
  it('posts document ids to the browse categories endpoint', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      categories: [{ name: 'Contracts', count: 2 }],
      uncategorized_count: 1,
      accessible_document_ids: ['1', '2', '3'],
    })

    const result = await fetchBrowseCategories(['1', '2', '3'])

    expect(apiPost).toHaveBeenCalledWith(
      '/browse/categories',
      { documents: ['1', '2', '3'] },
      true,
      undefined,
    )
    expect(result.categories).toEqual([{ name: 'Contracts', count: 2 }])
    expect(result.uncategorized_count).toBe(1)
  })
})

describe('fetchDocumentSummary', () => {
  it('gets the ingestion summary for a document', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      document_id: 'doc-1',
      filename: 'contract.pdf',
      summary: 'A short summary.',
      summary_status: 'READY',
      status_reason: null,
    })

    const result = await fetchDocumentSummary('doc-1')

    expect(apiGet).toHaveBeenCalledWith('/browse/documents/doc-1/summary', true, undefined)
    expect(result.summary).toBe('A short summary.')
    expect(result.summary_status).toBe('READY')
  })

  it('forwards the abort signal', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      document_id: 'doc-1',
      filename: 'contract.pdf',
      summary: null,
      summary_status: 'PENDING',
      status_reason: null,
    })
    const controller = new AbortController()

    await fetchDocumentSummary('doc-1', controller.signal)

    expect(apiGet).toHaveBeenCalledWith(
      '/browse/documents/doc-1/summary',
      true,
      controller.signal,
    )
  })
})
