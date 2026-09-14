import { describe, expect, it } from 'vitest'
import type { BrowseDocumentItem } from '../api/types/browse'
import { getExtractMetadataDisabledReason, isMqaMetadataReady } from './mqaMetadataGate'

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

describe('mqaMetadataGate', () => {
  it('treats READY summary_status as ready', () => {
    expect(isMqaMetadataReady(doc())).toBe(true)
    expect(isMqaMetadataReady(doc({ summary_status: 'PENDING' }))).toBe(false)
    expect(isMqaMetadataReady(undefined)).toBe(false)
  })

  it('blocks extraction until one ready document is selected', () => {
    expect(
      getExtractMetadataDisabledReason({
        selectedCount: 0,
        document: undefined,
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Select a document to extract metadata')

    expect(
      getExtractMetadataDisabledReason({
        selectedCount: 2,
        document: doc(),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Select only one document to extract metadata')

    expect(
      getExtractMetadataDisabledReason({
        selectedCount: 1,
        document: doc({ summary_status: 'PENDING' }),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Document is still being processed')

    expect(
      getExtractMetadataDisabledReason({
        selectedCount: 1,
        document: doc(),
        isResponding: false,
        disabled: false,
      }),
    ).toBeNull()
  })

  it('disables while any response is in flight or the session has expired', () => {
    expect(
      getExtractMetadataDisabledReason({
        selectedCount: 1,
        document: doc(),
        isResponding: true,
        disabled: false,
      }),
    ).toBe('Wait for the current response to finish')

    expect(
      getExtractMetadataDisabledReason({
        selectedCount: 1,
        document: doc(),
        isResponding: false,
        disabled: true,
      }),
    ).toBe('Sign in to extract metadata')
  })
})
