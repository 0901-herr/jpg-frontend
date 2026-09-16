import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BrowseDocumentItem } from '../api/types/browse'
import { getSelectableDocumentIds } from '../components/IndexingStatusBadge'
import {
  loadPersistedSelection,
  persistSelection,
} from '../utils/browsePersistence'

const EMPTY_SELECTION = new Set<string>()

interface SelectionState {
  userId: string | null | undefined
  ids: Set<string>
}

export function useDocumentSelection(userId?: string | null) {
  // `loadPersistedSelection()` returns `null` when the key was never
  // written (this browser has never persisted a selection) and a Set
  // (possibly empty) when it has — including a deliberate "deselect all".
  // Either way, `?? new Set()` starts the selection empty: by default
  // nothing is checked, so a fresh browser never triggers loading every
  // document up front. Read via a lazy `useState` initializer so it's only
  // ever evaluated once, at mount.
  const [selectionState, setSelectionState] = useState<SelectionState>(() => ({
    userId,
    ids: loadPersistedSelection(userId) ?? new Set(),
  }))
  const [documentMeta, setDocumentMeta] = useState<Map<string, BrowseDocumentItem>>(new Map())

  // Keep the account boundary in state as well as in localStorage. During
  // the render where a login switches accounts, return an empty selection
  // immediately; the effect then restores only the new account's slot.
  // That avoids even a one-render flash of the previous user's files.
  const selectedIds = selectionState.userId === userId ? selectionState.ids : EMPTY_SELECTION
  useEffect(() => {
    if (selectionState.userId === userId) return
    setSelectionState({ userId, ids: loadPersistedSelection(userId) ?? new Set() })
    setDocumentMeta(new Map())
  }, [selectionState.userId, userId])

  const updateSelection = useCallback(
    (updater: (previous: Set<string>) => Set<string>) => {
      setSelectionState((previous) => {
        const current = previous.userId === userId ? previous.ids : new Set<string>()
        const next = updater(current)
        persistSelection(next, userId)
        return { userId, ids: next }
      })
    },
    [userId],
  )

  const registerDocuments = useCallback((documents: BrowseDocumentItem[]) => {
    if (documents.length === 0) return
    setDocumentMeta((prev) => {
      const next = new Map(prev)
      for (const doc of documents) {
        next.set(doc.document_id, doc)
      }
      return next
    })
  }, [])

  const toggleDocument = useCallback((documentId: string, checked: boolean) => {
    updateSelection((prev) => {
      const next = new Set(prev)
      if (checked) next.add(documentId)
      else next.delete(documentId)
      return next
    })
  }, [updateSelection])

  const setSelection = useCallback((ids: Iterable<string>) => {
    const next = new Set(ids)
    updateSelection(() => next)
  }, [updateSelection])

  const mergeSelection = useCallback((ids: Iterable<string>) => {
    updateSelection((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [updateSelection])

  const removeSelection = useCallback((ids: Iterable<string>) => {
    updateSelection((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [updateSelection])

  const selectAllSelectable = useCallback(
    (documents: BrowseDocumentItem[], { replace = false }: { replace?: boolean } = {}) => {
      const ids = getSelectableDocumentIds(documents)
      if (replace) {
        setSelection(ids)
      } else if (ids.length > 0) {
        mergeSelection(ids)
      }
    },
    [mergeSelection, setSelection],
  )

  const deselectAllInView = useCallback((documents: BrowseDocumentItem[]) => {
    const viewIds = new Set(documents.map((doc) => doc.document_id))
    updateSelection((prev) => {
      const next = new Set([...prev].filter((id) => !viewIds.has(id)))
      return next
    })
  }, [updateSelection])

  const clearSelection = useCallback(() => {
    updateSelection(() => new Set())
  }, [updateSelection])

  const trimSelection = useCallback((accessibleIds: string[]) => {
    const allowed = new Set(accessibleIds)
    updateSelection((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)))
      return next
    })
    return allowed
  }, [updateSelection])

  const selectedFilenames = useMemo(
    () =>
      [...selectedIds]
        .map((id) => documentMeta.get(id)?.filename ?? `Document ${id}`)
        .sort((a, b) => a.localeCompare(b)),
    [documentMeta, selectedIds],
  )

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    selectedFilenames,
    documentMeta,
    registerDocuments,
    toggleDocument,
    setSelection,
    mergeSelection,
    removeSelection,
    selectAllSelectable,
    deselectAllInView,
    clearSelection,
    trimSelection,
  }
}

export type DocumentSelection = ReturnType<typeof useDocumentSelection>
