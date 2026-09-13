import { describe, expect, it } from 'vitest'
import type { BrowseDocumentItem } from '../api/types/browse'
import {
  countUncategorizedDocuments,
  extractCategories,
  filterDocumentsByCategory,
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
