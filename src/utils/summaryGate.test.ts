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
})
