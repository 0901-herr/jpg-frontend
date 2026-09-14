import type { TreeSelectProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/http'
import { fetchBrowseRoot, fetchFolderContents } from '../api/browse'
import type { BrowseDocumentItem, BrowseFolderContentsResponse } from '../api/types/browse'
import { BROWSE_IDLE_REFRESH_SECONDS, BROWSE_REFRESH_SECONDS } from '../config/browse'
import {
  loadPersistedActiveFolder,
  persistActiveFolder,
} from '../utils/browsePersistence'

interface FolderCacheEntry {
  contents: BrowseFolderContentsResponse
  loadedPages: Set<number>
}

type TreeSelectNode = NonNullable<TreeSelectProps['treeData']>[number]

function buildTreeSelectNodes(
  folderId: number,
  cache: Map<number, FolderCacheEntry>,
): TreeSelectNode[] {
  const entry = cache.get(folderId)
  if (!entry) return []

  return entry.contents.folders.map((folder) => {
    const childEntry = cache.get(folder.folder_id)
    const children = childEntry ? buildTreeSelectNodes(folder.folder_id, cache) : undefined

    return {
      value: folder.folder_id,
      title: folder.name,
      isLeaf: !folder.has_children,
      children: folder.has_children ? children : undefined,
    } satisfies TreeSelectNode
  })
}

export interface DocumentsLoadedEvent {
  folderId: number
  documents: BrowseDocumentItem[]
  page: number
}

export function useBrowseTree(onDocumentsLoaded?: (event: DocumentsLoadedEvent) => void) {
  const [rootFolderId, setRootFolderId] = useState<number | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [cache, setCache] = useState<Map<number, FolderCacheEntry>>(new Map())
  const [folderMeta, setFolderMeta] = useState<
    Map<number, { name: string; has_children: boolean; parent_id: number | null }>
  >(new Map())
  const [activeFolderId, setActiveFolderId] = useState<number | null>(() =>
    loadPersistedActiveFolder(),
  )
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<number>>(new Set())
  const [loadingMoreFolderId, setLoadingMoreFolderId] = useState<number | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)

  const mergeFolderContents = useCallback(
    (folderId: number, response: BrowseFolderContentsResponse, page: number) => {
      setCache((prev) => {
        const next = new Map(prev)
        const existing = next.get(folderId)

        if (!existing || page === 0) {
          next.set(folderId, { contents: response, loadedPages: new Set([page]) })
        } else {
          const mergedDocs = [...existing.contents.documents]
          const seen = new Set(mergedDocs.map((d) => d.document_id))
          for (const doc of response.documents) {
            if (!seen.has(doc.document_id)) mergedDocs.push(doc)
          }
          next.set(folderId, {
            contents: {
              ...response,
              documents: mergedDocs,
            },
            loadedPages: new Set([...existing.loadedPages, page]),
          })
        }
        return next
      })

      setFolderMeta((prev) => {
        const next = new Map(prev)
        next.set(response.folder.folder_id, {
          name: response.folder.name,
          has_children: response.folder.has_children,
          parent_id: response.folder.parent_id,
        })
        for (const folder of response.folders) {
          next.set(folder.folder_id, {
            name: folder.name,
            has_children: folder.has_children,
            parent_id: folder.parent_id,
          })
        }
        return next
      })

      onDocumentsLoaded?.({ folderId, documents: response.documents, page })
    },
    [onDocumentsLoaded],
  )

  /**
   * Merge freshly-fetched status fields into an already-cached folder's
   * documents, without replacing the folder's document list (which would
   * drop pages loaded via "load more") or touching its subfolder/pagination
   * metadata. Used by both the auto-refresh poll and the manual refresh
   * button so neither collapses the tree or clears the user's selection.
   */
  const mergeStatusUpdates = useCallback(
    (folderId: number, response: BrowseFolderContentsResponse) => {
      setCache((prev) => {
        const existing = prev.get(folderId)
        if (!existing) return prev

        const freshById = new Map(response.documents.map((doc) => [doc.document_id, doc]))
        let changed = false

        const mergedDocs = existing.contents.documents.map((doc) => {
          const fresh = freshById.get(doc.document_id)
          if (!fresh) return doc
          freshById.delete(doc.document_id)

          const sameStatus =
            fresh.indexing_status === doc.indexing_status &&
            fresh.status_reason === doc.status_reason &&
            fresh.queryable === doc.queryable &&
            fresh.rag_document_id === doc.rag_document_id &&
            fresh.summary_status === doc.summary_status &&
            fresh.classification_category === doc.classification_category
          if (sameStatus) return doc

          changed = true
          return {
            ...doc,
            indexing_status: fresh.indexing_status,
            status_reason: fresh.status_reason,
            queryable: fresh.queryable,
            rag_document_id: fresh.rag_document_id,
            summary_status: fresh.summary_status,
            classification_category: fresh.classification_category,
          }
        })

        const newlySeen = [...freshById.values()]
        if (newlySeen.length > 0) changed = true
        if (!changed) return prev

        const next = new Map(prev)
        next.set(folderId, {
          ...existing,
          contents: {
            ...existing.contents,
            documents: [...mergedDocs, ...newlySeen],
          },
        })
        return next
      })
    },
    [],
  )

  const loadFolder = useCallback(
    async (folderId: number, page = 0) => {
      if (page === 0) {
        setLoadingFolderIds((prev) => new Set(prev).add(folderId))
      } else {
        setLoadingMoreFolderId(folderId)
      }

      try {
        const response = await fetchFolderContents(folderId, page)
        mergeFolderContents(folderId, response, page)
        return response
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setSessionExpired(true)
        }
        throw err
      } finally {
        if (page === 0) {
          setLoadingFolderIds((prev) => {
            const next = new Set(prev)
            next.delete(folderId)
            return next
          })
        } else {
          setLoadingMoreFolderId(null)
        }
      }
    },
    [mergeFolderContents],
  )

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const root = await fetchBrowseRoot()
        if (cancelled) return

        setRootFolderId(root.root_folder_id)
        setUsername(root.username)

        const activeId = activeFolderId ?? root.root_folder_id
        setActiveFolderId(activeId)
        persistActiveFolder(activeId)

        await loadFolder(root.root_folder_id)
        if (activeId !== root.root_folder_id && !cancelled) {
          await loadFolder(activeId)
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          setSessionExpired(true)
        } else {
          setInitError(err instanceof Error ? err.message : 'Could not load folders')
        }
      } finally {
        if (!cancelled) setIsInitializing(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const treeSelectData = useMemo((): TreeSelectNode[] => {
    if (rootFolderId == null) return []
    const rootMeta = folderMeta.get(rootFolderId)
    const rootName = rootMeta?.name ?? 'Root'
    return [
      {
        value: rootFolderId,
        title: rootName,
        isLeaf: rootMeta ? !rootMeta.has_children : false,
        children: buildTreeSelectNodes(rootFolderId, cache),
      },
    ]
  }, [rootFolderId, cache, folderMeta])

  const activeFolderContents = useMemo(() => {
    if (activeFolderId == null) return null
    return cache.get(activeFolderId)?.contents ?? null
  }, [activeFolderId, cache])

  const activeFolderName = useMemo(() => {
    if (activeFolderId == null) return null
    return folderMeta.get(activeFolderId)?.name ?? null
  }, [activeFolderId, folderMeta])

  const handleSelectFolder = useCallback(
    async (folderId: number) => {
      setActiveFolderId(folderId)
      persistActiveFolder(folderId)
      if (!cache.has(folderId)) {
        await loadFolder(folderId)
      } else {
        const docs = cache.get(folderId)?.contents.documents ?? []
        onDocumentsLoaded?.({ folderId, documents: docs, page: 0 })
      }
    },
    [cache, loadFolder, onDocumentsLoaded],
  )

  const handleLoadTreeData = useCallback(
    async (node: TreeSelectNode) => {
      const folderId = Number(node.value)
      if (!Number.isFinite(folderId)) return
      if (!cache.has(folderId)) {
        await loadFolder(folderId)
      }
    },
    [cache, loadFolder],
  )

  const handleLoadMoreDocuments = useCallback(async () => {
    if (activeFolderId == null || !activeFolderContents?.has_more_documents) return
    const entry = cache.get(activeFolderId)
    const nextPage = entry ? entry.loadedPages.size : 1
    await loadFolder(activeFolderId, nextPage)
  }, [activeFolderId, activeFolderContents, cache, loadFolder])

  const refreshActiveFolder = useCallback(async () => {
    if (activeFolderId == null) return
    await loadFolder(activeFolderId, 0)
  }, [activeFolderId, loadFolder])

  const isActiveFolderLoading = activeFolderId != null && loadingFolderIds.has(activeFolderId)

  // True while any document in a loaded (expanded) folder has not settled
  // into a terminal state — drives the fast vs. idle poll cadence below.
  const hasUnsettledDocument = useMemo(() => {
    for (const entry of cache.values()) {
      for (const doc of entry.contents.documents) {
        if (doc.indexing_status !== 'READY' && doc.indexing_status !== 'FAILED') return true
      }
    }
    return false
  }, [cache])

  const expandedFolderIds = useMemo(() => [...cache.keys()], [cache])

  const fetchAndMergeStatuses = useCallback(
    async (folderIds: number[]) => {
      await Promise.all(
        folderIds.map((id) =>
          fetchFolderContents(id, 0)
            .then((response) => mergeStatusUpdates(id, response))
            .catch(() => {
              // Transient poll failure — keep showing the last-known status
              // and try again on the next tick / manual refresh.
            }),
        ),
      )
    },
    [mergeStatusUpdates],
  )

  /** Manual refresh: re-fetch the root plus every folder the user has expanded. */
  const refreshDocumentStatuses = useCallback(async () => {
    const ids = new Set(expandedFolderIds)
    if (rootFolderId != null) ids.add(rootFolderId)
    if (ids.size === 0) return
    await fetchAndMergeStatuses([...ids])
  }, [expandedFolderIds, rootFolderId, fetchAndMergeStatuses])

  // Auto-refresh: poll expanded folders' contents while the /chat page is
  // open. Cadence is VITE_BROWSE_REFRESH_SECONDS (0 disables) whenever a
  // visible document hasn't settled, else the slower idle cadence. Paused
  // while the tab is hidden; resumes immediately on visibilitychange.
  useEffect(() => {
    if (BROWSE_REFRESH_SECONDS <= 0) return undefined
    if (rootFolderId == null || expandedFolderIds.length === 0) return undefined

    const seconds = hasUnsettledDocument ? BROWSE_REFRESH_SECONDS : BROWSE_IDLE_REFRESH_SECONDS

    const pollNow = () => {
      if (document.hidden) return
      void fetchAndMergeStatuses(expandedFolderIds)
    }

    const intervalId = setInterval(pollNow, seconds * 1000)

    const handleVisibility = () => {
      if (!document.hidden) pollNow()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [rootFolderId, expandedFolderIds, hasUnsettledDocument, fetchAndMergeStatuses])

  return {
    username,
    rootFolderId,
    treeSelectData,
    activeFolderId,
    activeFolderName,
    activeFolderContents,
    isInitializing,
    initError,
    sessionExpired,
    isActiveFolderLoading,
    loadingMoreFolderId,
    handleSelectFolder,
    handleLoadTreeData,
    handleLoadMoreDocuments,
    refreshActiveFolder,
    refreshDocumentStatuses,
  }
}

export type BrowseTreeState = ReturnType<typeof useBrowseTree>
