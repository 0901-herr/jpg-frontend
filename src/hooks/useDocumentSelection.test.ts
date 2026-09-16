import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentSelection } from './useDocumentSelection'
import { persistSelection } from '../utils/browsePersistence'
import type { BrowseDocumentItem } from '../api/types/browse'

function doc(id: string, overrides: Partial<BrowseDocumentItem> = {}): BrowseDocumentItem {
  return {
    document_id: id,
    filename: `${id}.pdf`,
    file_type: 'pdf',
    updated_at: '2026-09-14T00:00:00Z',
    folder_id: 1,
    indexing_status: 'READY',
    rag_document_id: `rag-${id}`,
    queryable: true,
    ...overrides,
  }
}

describe('useDocumentSelection — default selection is empty, no auto-select', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with an empty selection when nothing was ever persisted', () => {
    const { result } = renderHook(() => useDocumentSelection())

    expect(result.current.selectedIds).toEqual(new Set())
  })

  it('never auto-selects documents when they load, even on the very first page-0 load of a fresh browser', () => {
    const { result } = renderHook(() => useDocumentSelection())
    const documents = [doc('1'), doc('2')]

    act(() => {
      result.current.registerDocuments(documents)
    })

    expect(result.current.selectedIds).toEqual(new Set())
  })

  it('restores a persisted partial selection on mount', () => {
    persistSelection(new Set(['1']))
    const { result } = renderHook(() => useDocumentSelection())

    expect(result.current.selectedIds).toEqual(new Set(['1']))
  })

  it('restores a persisted explicit-empty selection on mount', () => {
    persistSelection(new Set())
    const { result } = renderHook(() => useDocumentSelection())

    expect(result.current.selectedIds).toEqual(new Set())
  })

  it('does not change the selection when documents load, on "load more" (page > 0) or otherwise', () => {
    persistSelection(new Set(['1']))
    const { result } = renderHook(() => useDocumentSelection())
    const morePage = [doc('2'), doc('3')]

    act(() => {
      result.current.registerDocuments(morePage)
    })

    expect(result.current.selectedIds).toEqual(new Set(['1']))
  })

  it('no longer exposes any auto-select-everything capability from the hook', () => {
    const { result } = renderHook(() => useDocumentSelection())

    expect(result.current).not.toHaveProperty('autoSelectIfPending')
  })
})
