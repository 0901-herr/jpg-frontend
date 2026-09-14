import { describe, expect, it } from 'vitest'
import type { BrowseCategoriesResponse, BrowseDocumentItem } from '../api/types/browse'
import {
  countUncategorizedDocuments,
  extractCategories,
  filterDocumentsByCategory,
  getUncategorizedNote,
  isUncategorizedDocument,
} from './documentCategories'

function doc(id: string, category?: string | null): BrowseDocumentItem {
  return {
    document_id: id,
    filename: `doc-${id}.pdf`,
    file_type: 'pdf',
    updated_at: '2026-09-13T00:00:00Z',
    folder_id: 4,
    indexing_status: 'READY',
    rag_document_id: 'rag-1',
    classification_category: category ?? undefined,
    queryable: true,
  }
}

describe('documentCategories', () => {
  it('treats missing, blank, and unknown as uncategorized', () => {
    expect(isUncategorizedDocument(doc('1'))).toBe(true)
    expect(isUncategorizedDocument(doc('2', ''))).toBe(true)
    expect(isUncategorizedDocument(doc('3', '   '))).toBe(true)
    expect(isUncategorizedDocument(doc('4', 'unknown'))).toBe(true)
    expect(isUncategorizedDocument(doc('5', 'Contracts'))).toBe(false)
  })

  it('extractCategories omits uncategorized documents', () => {
    const documents = [
      doc('1', 'Contracts'),
      doc('2', 'Contracts'),
      doc('3'),
      doc('4', 'unknown'),
      doc('5', 'Invoices'),
    ]

    expect(extractCategories(documents)).toEqual([
      { name: 'Contracts', count: 2 },
      { name: 'Invoices', count: 1 },
    ])
  })

  it('countUncategorizedDocuments counts only uncategorized docs', () => {
    const documents = [doc('1', 'Contracts'), doc('2'), doc('3', 'unknown')]
    expect(countUncategorizedDocuments(documents)).toBe(2)
  })

  it('filterDocumentsByCategory matches real category names only', () => {
    const documents = [doc('1', 'Contracts'), doc('2'), doc('3', 'Contracts')]
    expect(filterDocumentsByCategory(documents, 'Contracts')).toEqual([
      doc('1', 'Contracts'),
      doc('3', 'Contracts'),
    ])
  })
})

describe('getUncategorizedNote', () => {
  const base: BrowseCategoriesResponse = {
    categories: [],
    uncategorized_count: 0,
    accessible_document_ids: [],
  }

  it('prefers the server-provided note when present', () => {
    expect(
      getUncategorizedNote({ ...base, uncategorized_count: 3, note: 'Server note text' }),
    ).toBe('Server note text')
  })

  it('falls back to a singular local message for one uncategorized file', () => {
    expect(getUncategorizedNote({ ...base, uncategorized_count: 1, note: null })).toBe(
      '1 file is not shown because it has not been categorised yet.',
    )
  })

  it('falls back to a plural local message for N uncategorized files', () => {
    expect(getUncategorizedNote({ ...base, uncategorized_count: 4, note: null })).toBe(
      '4 files are not shown because they have not been categorised yet.',
    )
  })

  it('ignores a blank server note and falls back to the local message', () => {
    expect(getUncategorizedNote({ ...base, uncategorized_count: 2, note: '   ' })).toBe(
      '2 files are not shown because they have not been categorised yet.',
    )
  })

  it('returns null when there are no uncategorized documents', () => {
    expect(getUncategorizedNote({ ...base, uncategorized_count: 0, note: null })).toBeNull()
  })

  it('returns null when categories is null', () => {
    expect(getUncategorizedNote(null)).toBeNull()
  })
})
