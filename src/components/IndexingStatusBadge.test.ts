import { describe, expect, it } from 'vitest'
import {
  getDocumentSelectionHint,
  getSelectableDocumentIds,
  isDocumentSelectable,
} from './IndexingStatusBadge'
import type { BrowseDocumentItem } from '../api/types/browse'

function doc(
  document_id: string,
  indexing_status: BrowseDocumentItem['indexing_status'],
  queryable: boolean,
): BrowseDocumentItem {
  return {
    document_id,
    filename: `${document_id}.pdf`,
    file_type: 'pdf',
    updated_at: '2026-09-13T00:00:00Z',
    folder_id: 4,
    indexing_status,
    rag_document_id: null,
    queryable,
  }
}

describe('getDocumentSelectionHint', () => {
  it('prefers adapter status_reason over local fallback copy', () => {
    expect(
      getDocumentSelectionHint({
        ...doc('1', 'PARTIAL', true),
        status_reason: 'Text search only; full vector indexing is still in progress.',
      }),
    ).toBe('Text search only; full vector indexing is still in progress.')
  })

  it('falls back to indexing-status copy when status_reason is absent', () => {
    expect(getDocumentSelectionHint(doc('1', 'FAILED', false))).toBe(
      'Indexing failed. Not queryable.',
    )
  })
})

describe('IndexingStatusBadge selection rules', () => {
  it('allows PARTIAL documents when queryable', () => {
    expect(isDocumentSelectable('PARTIAL', true)).toBe(true)
    const ids = getSelectableDocumentIds([
      doc('1', 'READY', true),
      doc('2', 'PARTIAL', true),
      doc('3', 'FAILED', false),
    ])
    expect(ids).toEqual(['1', '2'])
  })
})
