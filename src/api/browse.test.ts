import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractMetadata,
  fetchBrowseCategories,
  fetchBrowseStatus,
  fetchDocumentSummary,
} from './browse'
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

  it('merges successful chunks and ignores a failed chunk', async () => {
    const firstChunk = Array.from({ length: 500 }, (_, i) => String(i))
    const secondChunk = ['500', '501']
    vi.mocked(apiPost).mockImplementation(async (_path, body) => {
      const ids = (body as { document_ids: string[] }).document_ids
      if (ids === secondChunk || ids[0] === '500') throw new Error('adapter timeout')
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

    expect(result.documents).toHaveLength(500)
    expect(result.documents.map((doc) => doc.document_id)).not.toContain('500')
  })

  it('rejects only when every chunk fails', async () => {
    const firstChunk = Array.from({ length: 500 }, (_, i) => String(i))
    const secondChunk = ['500', '501']
    vi.mocked(apiPost).mockRejectedValue(new Error('adapter down'))

    await expect(fetchBrowseStatus([...firstChunk, ...secondChunk])).rejects.toThrow('adapter down')
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

describe('extractMetadata', () => {
  it('posts an empty body to the extract-metadata endpoint', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      document_id: '5003',
      filename: '01_Meeting_Minutes.pdf',
      fields: {
        'Document Title': 'Meeting Minutes',
        Faculty: 'Not stated',
        'Programme name and code': 'Not stated',
        'Academic year': 'Not stated',
        'Accreditation body': 'Not stated',
        'Programme Coordinator': 'Not stated',
      },
      field_order: [
        'Document Title',
        'Faculty',
        'Programme name and code',
        'Academic year',
        'Accreditation body',
        'Programme Coordinator',
      ],
      comment: 'Arche AI extracted metadata — Document Title: Meeting Minutes; ...',
      pushed: true,
      push_error: null,
    })

    const result = await extractMetadata('5003')

    expect(apiPost).toHaveBeenCalledWith(
      '/browse/documents/5003/extract-metadata',
      {},
      true,
      undefined,
    )
    expect(result.pushed).toBe(true)
    expect(result.fields['Document Title']).toBe('Meeting Minutes')
  })

  it('forwards the abort signal', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      document_id: '5003',
      filename: '01_Meeting_Minutes.pdf',
      fields: {
        'Document Title': 'Not stated',
        Faculty: 'Not stated',
        'Programme name and code': 'Not stated',
        'Academic year': 'Not stated',
        'Accreditation body': 'Not stated',
        'Programme Coordinator': 'Not stated',
      },
      field_order: [
        'Document Title',
        'Faculty',
        'Programme name and code',
        'Academic year',
        'Accreditation body',
        'Programme Coordinator',
      ],
      comment: 'Arche AI extracted metadata — Document Title: Not stated; ...',
      pushed: false,
      push_error: 'LogicalDOC comment API unavailable',
    })
    const controller = new AbortController()

    await extractMetadata('5003', controller.signal)

    expect(apiPost).toHaveBeenCalledWith(
      '/browse/documents/5003/extract-metadata',
      {},
      true,
      controller.signal,
    )
  })
})
