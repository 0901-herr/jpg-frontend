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

describe('useDocumentSelection — auto-select-once + load-more behaviour', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('auto-selects all selectable documents on the first page-0 load when nothing was ever persisted', () => {
    const { result } = renderHook(() => useDocumentSelection())
    const documents = [doc('1'), doc('2')]

    act(() => {
      result.current.registerDocuments(documents)
      result.current.autoSelectIfPending(documents)
    })

    expect(result.current.selectedIds).toEqual(new Set(['1', '2']))
  })

  it('stays empty on a page-0 load after an explicit clear (persisted [])', () => {
    persistSelection(new Set())
    const { result } = renderHook(() => useDocumentSelection())
    const documents = [doc('1'), doc('2')]

    act(() => {
      result.current.registerDocuments(documents)
      result.current.autoSelectIfPending(documents)
    })

    expect(result.current.selectedIds).toEqual(new Set())
  })

  it('leaves a persisted partial selection unchanged on a page-0 load', () => {
    persistSelection(new Set(['1']))
    const { result } = renderHook(() => useDocumentSelection())
    const documents = [doc('1'), doc('2')]

    act(() => {
      result.current.registerDocuments(documents)
      result.current.autoSelectIfPending(documents)
    })

    expect(result.current.selectedIds).toEqual(new Set(['1']))
  })

  it('never auto-selects again after the first decision, even on a later page-0 load with an empty selection', () => {
    const { result } = renderHook(() => useDocumentSelection())
    const page1 = [doc('1')]
    const page2 = [doc('1'), doc('2')]

    act(() => {
      result.current.registerDocuments(page1)
      result.current.autoSelectIfPending(page1)
    })
    expect(result.current.selectedIds).toEqual(new Set(['1']))

    act(() => {
      result.current.clearSelection()
    })
    expect(result.current.selectedIds).toEqual(new Set())

    // A later page-0 load (folder switch, refresh) must not refill it.
    act(() => {
      result.current.registerDocuments(page2)
      result.current.autoSelectIfPending(page2)
    })
    expect(result.current.selectedIds).toEqual(new Set())
  })

  it('does not change the selection on "load more" (page > 0)', () => {
    persistSelection(new Set(['1']))
    const { result } = renderHook(() => useDocumentSelection())
    const morePage = [doc('2'), doc('3')]

    act(() => {
      result.current.registerDocuments(morePage)
      // Simulates AppLayout's handleDocumentsLoaded for page > 0: no call
      // to autoSelectIfPending / selectAllSelectable at all.
    })

    expect(result.current.selectedIds).toEqual(new Set(['1']))
  })
})
