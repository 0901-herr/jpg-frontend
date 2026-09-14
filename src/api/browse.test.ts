import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBrowseCategories, fetchBrowseStatus, fetchDocumentSummary } from './browse'
import { apiGet, apiPost } from './http'

vi.mock('./http', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

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

describe('fetchBrowseStatus', () => {
  it('posts document ids to the cheap status endpoint', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      documents: [
        {
          document_id: '5051',
          indexing_status: 'PARTIAL',
          status_reason: null,
          queryable: true,
          summary_status: 'PENDING',
          classification_category: null,
          rag_document_id: '4d2b',
        },
      ],
    })

    const result = await fetchBrowseStatus(['5003', '5051'])

    expect(apiPost).toHaveBeenCalledWith(
      '/browse/status',
      { document_ids: ['5003', '5051'] },
      true,
      undefined,
    )
    expect(result.documents).toEqual([
      {
        document_id: '5051',
        indexing_status: 'PARTIAL',
        status_reason: null,
        queryable: true,
        summary_status: 'PENDING',
        classification_category: null,
        rag_document_id: '4d2b',
      },
    ])
  })

  it('returns an empty result without calling the endpoint when given no ids', async () => {
    const result = await fetchBrowseStatus([])

    expect(apiPost).not.toHaveBeenCalled()
    expect(result.documents).toEqual([])
  })

  it('splits more than 500 ids across multiple calls and merges the results', async () => {
    const firstChunk = Array.from({ length: 500 }, (_, i) => String(i))
    const secondChunk = ['500', '501']
    vi.mocked(apiPost).mockImplementation(async (_path, body) => {
      const ids = (body as { document_ids: string[] }).document_ids
      return {
        documents: ids.map((id) => ({
          document_id: id,
          indexing_status: 'READY' as const,
          status_reason: null,
          queryable: true,
          summary_status: null,
          classification_category: null,
          rag_document_id: null,
        })),
      }
    })

    const result = await fetchBrowseStatus([...firstChunk, ...secondChunk])

    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(apiPost).toHaveBeenNthCalledWith(1, '/browse/status', { document_ids: firstChunk }, true, undefined)
    expect(apiPost).toHaveBeenNthCalledWith(2, '/browse/status', { document_ids: secondChunk }, true, undefined)
    expect(result.documents).toHaveLength(502)
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
