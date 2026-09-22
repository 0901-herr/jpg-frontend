import { describe, expect, it } from 'vitest'
import type { BrowseDocumentItem } from '../api/types/browse'
import { getSummarizeDisabledReason, isSummaryReady } from './summaryGate'

function doc(overrides: Partial<BrowseDocumentItem> = {}): BrowseDocumentItem {
  return {
    document_id: '5012',
    filename: 'sample.pdf',
    file_type: 'pdf',
    updated_at: '2026-09-13T00:00:00Z',
    folder_id: 4,
    indexing_status: 'READY',
    rag_document_id: 'rag-1',
    queryable: true,
    summary_status: 'READY',
    ...overrides,
  }
}

describe('summaryGate', () => {
  it('treats READY summary_status as ready', () => {
    expect(isSummaryReady(doc())).toBe(true)
  })

  it('blocks summarize until one ready document is selected', () => {
    expect(
      getSummarizeDisabledReason({
        selectedCount: 0,
        document: undefined,
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Select one document')

    expect(
      getSummarizeDisabledReason({
        selectedCount: 2,
        document: doc(),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Select only one document')

    // Selected, but its metadata hasn't synced yet — never blame the user
    // for "not selecting" a file they did select.
    expect(
      getSummarizeDisabledReason({
        selectedCount: 1,
        document: undefined,
        isResponding: false,
        disabled: false,
      }),
    ).toBe('File not ready yet')

    expect(
      getSummarizeDisabledReason({
        selectedCount: 1,
        document: doc({ summary_status: 'PENDING' }),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Summary not ready yet')

    expect(
      getSummarizeDisabledReason({
        selectedCount: 1,
        document: doc(),
        isResponding: false,
        disabled: false,
      }),
    ).toBeNull()
  })

  it('reports the file itself as not ready while it is still ingesting, distinct from a lagging summary', () => {
    expect(
      getSummarizeDisabledReason({
        selectedCount: 1,
        document: doc({
          indexing_status: 'NOT_INDEXED',
          queryable: false,
          summary_status: 'PENDING',
        }),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('File not ready yet')

    expect(
      getSummarizeDisabledReason({
        selectedCount: 1,
        document: doc({ indexing_status: 'INDEXING', queryable: false, summary_status: null }),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('File not ready yet')

    // Fully indexed and queryable, but the summary itself hasn't been
    // generated yet — the file is ready, only the summary is pending.
    expect(
      getSummarizeDisabledReason({
        selectedCount: 1,
        document: doc({
          indexing_status: 'READY',
          queryable: true,
          summary_status: 'PENDING',
        }),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Summary not ready yet')
  })
})
