import { act, renderHook, waitFor } from '@testing-library/react'
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

  it('keeps selections isolated by authenticated user and never restores the legacy shared key for an account', async () => {
    // Simulates a browser that was previously used by an admin before the
    // selection key gained an account scope. That old global value must not
    // appear for the next person who signs in on the same browser.
    persistSelection(new Set(['admin-doc-1', 'admin-doc-2']))
    persistSelection(new Set(['admin-doc-1', 'admin-doc-2']), 'admin')

    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) => useDocumentSelection(userId),
      { initialProps: { userId: 'member' } },
    )

    expect(result.current.selectedIds).toEqual(new Set())

    // Account switching in one mounted app must load the right account's
    // own saved selection, without exposing the prior one in between.
    rerender({ userId: 'admin' })
    await waitFor(() =>
      expect(result.current.selectedIds).toEqual(new Set(['admin-doc-1', 'admin-doc-2'])),
    )

    rerender({ userId: 'member' })
    expect(result.current.selectedIds).toEqual(new Set())
  })

  it('persists a selection across a reload for the same authenticated user', () => {
    const first = renderHook(() => useDocumentSelection('user-1'))
    act(() => {
      first.result.current.toggleDocument('doc-1', true)
    })
    first.unmount()

    const second = renderHook(() => useDocumentSelection('user-1'))
    expect(second.result.current.selectedIds).toEqual(new Set(['doc-1']))
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

  it('rejects a toggle that would exceed the explicit selection limit', () => {
    const initial = new Set(Array.from({ length: 500 }, (_, i) => String(i)))
    persistSelection(initial)
    const { result } = renderHook(() => useDocumentSelection())

    act(() => {
      expect(result.current.toggleDocument('501', true)).toBe(false)
    })

    expect(result.current.selectedCount).toBe(500)
    expect(result.current.selectedIds.has('501')).toBe(false)
  })

  it('rejects an oversized bulk selection without partially mutating state', () => {
    const { result } = renderHook(() => useDocumentSelection())
    const documents = Array.from({ length: 501 }, (_, i) => doc(String(i)))

    act(() => {
      expect(result.current.selectAllSelectable(documents, { replace: true })).toBe(false)
    })

    expect(result.current.selectedCount).toBe(0)
  })

  it('clears an oversized persisted selection instead of restoring it', () => {
    localStorage.setItem(
      'docu_selected_documents',
      JSON.stringify(Array.from({ length: 501 }, (_, i) => String(i))),
    )

    const { result } = renderHook(() => useDocumentSelection())

    expect(result.current.selectedCount).toBe(0)
    expect(localStorage.getItem('docu_selected_documents')).toBeNull()
  })
})
