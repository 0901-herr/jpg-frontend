import { useCallback, useMemo, useRef, useState } from 'react'
import type { BrowseDocumentItem } from '../api/types/browse'
import { getSelectableDocumentIds } from '../components/IndexingStatusBadge'
import {
  loadPersistedSelection,
  persistSelection,
} from '../utils/browsePersistence'

export function useDocumentSelection() {
  // `loadPersistedSelection()` returns `null` when the key was never
  // written (this browser has never persisted a selection) and a Set
  // (possibly empty) when it has — including a deliberate "deselect all".
  // Read via a lazy `useState` initializer so it's only ever evaluated once,
  // at mount.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => loadPersistedSelection() ?? new Set(),
  )
  const [documentMeta, setDocumentMeta] = useState<Map<string, BrowseDocumentItem>>(new Map())
  // True only until the first documents-loaded auto-select decision is
  // made, and only when nothing was ever persisted. Consulted and cleared
  // exactly once by `autoSelectIfPending` — never reset afterwards, so an
  // explicit clear (which persists `[]`) can never be auto-refilled by a
  // later folder switch, refresh, or "Load more".
  const [neverPersisted] = useState(() => loadPersistedSelection() === null)
  const autoSelectPendingRef = useRef(neverPersisted)

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
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(documentId)
      else next.delete(documentId)
      persistSelection(next)
      return next
    })
  }, [])

  const setSelection = useCallback((ids: Iterable<string>) => {
    const next = new Set(ids)
    setSelectedIds(next)
    persistSelection(next)
  }, [])

  const mergeSelection = useCallback((ids: Iterable<string>) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      persistSelection(next)
      return next
    })
  }, [])

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

  // Called on every page-0 documents-loaded event. Auto-selects all
  // selectable documents exactly once per browser — only while nothing has
  // ever been persisted — then clears the pending flag for good (persisting
  // via `selectAllSelectable`'s own `setSelection` call). Returns whether it
  // actually auto-selected, mostly for tests.
  const autoSelectIfPending = useCallback(
    (documents: BrowseDocumentItem[]) => {
      if (!autoSelectPendingRef.current) return false
      autoSelectPendingRef.current = false
      selectAllSelectable(documents, { replace: true })
      return true
    },
    [selectAllSelectable],
  )

  const deselectAllInView = useCallback((documents: BrowseDocumentItem[]) => {
    const viewIds = new Set(documents.map((doc) => doc.document_id))
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => !viewIds.has(id)))
      persistSelection(next)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    persistSelection(new Set())
  }, [])

  const trimSelection = useCallback((accessibleIds: string[]) => {
    const allowed = new Set(accessibleIds)
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => allowed.has(id)))
      persistSelection(next)
      return next
    })
    return allowed
  }, [])

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
    selectAllSelectable,
    autoSelectIfPending,
    deselectAllInView,
    clearSelection,
    trimSelection,
  }
}

export type DocumentSelection = ReturnType<typeof useDocumentSelection>
