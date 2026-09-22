import { App, type TreeSelectProps } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api/http'
import { fetchBrowseRoot, fetchBrowseStatus, fetchFolderContents } from '../api/browse'
import type {
  BrowseDocumentItem,
  BrowseFolderContentsResponse,
  BrowseFolderNode,
  BrowseStatusItem,
} from '../api/types/browse'
import { BROWSE_IDLE_REFRESH_SECONDS, BROWSE_REFRESH_SECONDS } from '../config/browse'
import {
  loadPersistedActiveFolder,
  persistActiveFolder,
} from '../utils/browsePersistence'
import {
  FOLDER_LOAD_SERVER_ERROR,
  toUserFacingFolderLoadError,
  type FolderLoadError,
} from '../utils/userFacingErrors'
import { markUnreachableCardShown } from '../utils/backendUnreachableNotice'

const REMEMBERED_FOLDER_GONE_WARNING =
  'The remembered folder no longer exists — showing the root folder.'
const FOLDER_NO_LONGER_EXISTS_WARNING = 'That folder no longer exists.'

/** Fields the cheap /browse/status endpoint can patch onto a cached document. */
type DocumentStatusPatch = Pick<
  BrowseDocumentItem,
  | 'document_id'
  | 'indexing_status'
  | 'status_reason'
  | 'queryable'
  | 'rag_document_id'
  | 'summary_status'
  | 'classification_category'
>

function patchDocumentStatus(
  doc: BrowseDocumentItem,
  fresh: DocumentStatusPatch,
): { doc: BrowseDocumentItem; changed: boolean } {
  const sameStatus =
    fresh.indexing_status === doc.indexing_status &&
    fresh.status_reason === doc.status_reason &&
    fresh.queryable === doc.queryable &&
    fresh.rag_document_id === doc.rag_document_id &&
    fresh.summary_status === doc.summary_status &&
    fresh.classification_category === doc.classification_category
  if (sameStatus) return { doc, changed: false }

  return {
    doc: {
      ...doc,
      indexing_status: fresh.indexing_status,
      status_reason: fresh.status_reason,
      queryable: fresh.queryable,
      rag_document_id: fresh.rag_document_id,
      summary_status: fresh.summary_status,
      classification_category: fresh.classification_category,
    },
    changed: true,
  }
}

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

export function useBrowseTree(
  onDocumentsLoaded?: (event: DocumentsLoadedEvent) => void,
  onDocumentsRemoved?: (documentIds: string[]) => void,
) {
  // `App.useApp()` rather than the static `message` import from 'antd' —
  // the static functions "can not consume context like dynamic theme"
  // (antd's own deprecation warning); this hook is only ever called from
  // AppLayout, which now renders under the `<App>` provider (App.tsx).
  const { message } = App.useApp()
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
  const [initError, setInitError] = useState<FolderLoadError | null>(null)
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
   *
   * Also re-registers whatever changed via `onDocumentsLoaded` — otherwise
   * `selection.documentMeta` (what the Summarize/Extract Metadata buttons
   * read) goes stale the moment a document's status changes here, even
   * though the file tree itself is showing the fresh status live.
   *
   * And prunes documents this fresh listing no longer contains — e.g.
   * deleted in LogicalDOC — via `onDocumentsRemoved`, so a gone document
   * stops lingering in the tree (and in the user's selection) forever.
   * Only trustworthy when this folder has no page beyond 0 loaded: this
   * refresh only ever re-fetches page 0, so a "load more" page's documents
   * would otherwise look deleted just for not being in that page.
   */
  const mergeStatusUpdates = useCallback(
    (folderId: number, response: BrowseFolderContentsResponse) => {
      // Computed up front from the current `cache` (not inside the setCache
      // updater below): a functional updater's body isn't guaranteed to run
      // synchronously, so anything the callbacks after this need must be
      // worked out before calling setCache, not read back out afterward.
      const existing = cache.get(folderId)
      if (!existing) return

      const canDetectRemovals = existing.loadedPages.size === 1 && existing.loadedPages.has(0)
      const freshById = new Map(response.documents.map((doc) => [doc.document_id, doc]))
      let changed = false
      const changedDocs: BrowseDocumentItem[] = []
      const removedIds: string[] = []

      const mergedDocs: BrowseDocumentItem[] = []
      for (const doc of existing.contents.documents) {
        const fresh = freshById.get(doc.document_id)
        if (!fresh) {
          if (canDetectRemovals) {
            removedIds.push(doc.document_id)
            changed = true
          } else {
            mergedDocs.push(doc)
          }
          continue
        }
        freshById.delete(doc.document_id)

        const result = patchDocumentStatus(doc, fresh)
        if (result.changed) {
          changed = true
          changedDocs.push(result.doc)
        }
        mergedDocs.push(result.doc)
      }

      const newlySeen = [...freshById.values()]
      if (newlySeen.length > 0) {
        changed = true
        changedDocs.push(...newlySeen)
      }

      if (changed) {
        setCache((prev) => {
          const prevEntry = prev.get(folderId)
          if (!prevEntry) return prev
          const next = new Map(prev)
          next.set(folderId, {
            ...prevEntry,
            contents: { ...prevEntry.contents, documents: [...mergedDocs, ...newlySeen] },
          })
          return next
        })
      }

      if (changedDocs.length > 0) {
        onDocumentsLoaded?.({ folderId, documents: changedDocs, page: 0 })
      }
      if (removedIds.length > 0) {
        onDocumentsRemoved?.(removedIds)
      }
    },
    [cache, onDocumentsLoaded, onDocumentsRemoved],
  )

  /**
   * Apply a batch of cheap /browse/status patches across every cached
   * folder, keyed by document id. Reuses the same non-destructive merge
   * semantics as mergeStatusUpdates above (only patches known status
   * fields; never drops or replaces a folder's document list) — just
   * scoped to a flat id-keyed patch list spanning every expanded folder
   * instead of one folder's full contents response. This is what the
   * cheap fast-cadence poll uses instead of a full per-folder re-fetch.
   *
   * Also re-registers whatever changed via `onDocumentsLoaded`, same as
   * `mergeStatusUpdates` above, so the composer buttons stay in sync with
   * the fast-cadence poll too. An id this batch has no patch for is simply
   * left untouched here — never treated as deleted: unlike a full-folder
   * listing, an id being missing from this targeted lookup is documented
   * adapter behaviour for "no mapping right now", not proof the document is
   * gone (see fetchBrowseStatus in api/browse.ts).
   */
  const applyStatusPatches = useCallback(
    (patches: BrowseStatusItem[]) => {
      if (patches.length === 0) return
      const patchById = new Map(patches.map((patch) => [patch.document_id, patch]))
      // Computed up front from the current `cache`, same reasoning as
      // mergeStatusUpdates above: a setCache updater's body isn't
      // guaranteed to run synchronously, so this can't be read back out of
      // one afterward.
      const changedByFolder = new Map<number, BrowseDocumentItem[]>()
      let changedAny = false

      for (const [folderId, entry] of cache) {
        for (const doc of entry.contents.documents) {
          const patch = patchById.get(doc.document_id)
          if (!patch) continue
          const result = patchDocumentStatus(doc, patch)
          if (result.changed) {
            changedAny = true
            const list = changedByFolder.get(folderId) ?? []
            list.push(result.doc)
            changedByFolder.set(folderId, list)
          }
        }
      }

      if (changedAny) {
        setCache((prev) => {
          const next = new Map(prev)
          for (const [folderId, entry] of prev) {
            const mergedDocs = entry.contents.documents.map((doc) => {
              const patch = patchById.get(doc.document_id)
              return patch ? patchDocumentStatus(doc, patch).doc : doc
            })
            next.set(folderId, {
              ...entry,
              contents: { ...entry.contents, documents: mergedDocs },
            })
          }
          return next
        })
      }

      for (const [folderId, documents] of changedByFolder) {
        onDocumentsLoaded?.({ folderId, documents, page: 0 })
      }
    },
    [cache, onDocumentsLoaded],
  )

  // Page-0 (folder-expansion) loads only, keyed by folder id: a folder the
  // Tree is already fetching (via loadData, or any other caller) hands back
  // the same in-flight promise instead of starting a second, redundant
  // fetch — e.g. a second click on a folder that's still expanding, or a
  // loadData call racing a checkbox click's ensureFolderLoaded. "Load more"
  // (page > 0) isn't deduplicated this way; only one can run at a time
  // anyway via loadingMoreFolderId.
  const folderLoadInFlightRef = useRef<Map<number, Promise<BrowseFolderContentsResponse>>>(
    new Map(),
  )

  const loadFolder = useCallback(
    (folderId: number, page = 0): Promise<BrowseFolderContentsResponse> => {
      if (page === 0) {
        const inflight = folderLoadInFlightRef.current.get(folderId)
        if (inflight) return inflight
      }

      const promise = (async () => {
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
            folderLoadInFlightRef.current.delete(folderId)
          } else {
            setLoadingMoreFolderId(null)
          }
        }
      })()

      if (page === 0) {
        folderLoadInFlightRef.current.set(folderId, promise)
      }
      return promise
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
          try {
            await loadFolder(activeId)
          } catch (activeErr) {
            if (cancelled) return
            // A 401 keeps the existing session-expired handling (already
            // set by loadFolder above) — it overrides the whole sidebar
            // regardless of which folder was active, so there is nothing
            // else to reconcile here.
            if (activeErr instanceof ApiError && activeErr.status === 401) {
              return
            }
            // The remembered active folder is gone or unreachable, but the
            // root loaded fine — this must never be fatal (never set
            // initError): fall back to the root folder as active, forget
            // the stale persisted id so the next load doesn't retry it,
            // and only bother the user with a warning for it.
            setActiveFolderId(root.root_folder_id)
            persistActiveFolder(null)
            if (activeErr instanceof ApiError && activeErr.status === 404) {
              message.warning(REMEMBERED_FOLDER_GONE_WARNING)
            } else {
              message.warning(FOLDER_LOAD_SERVER_ERROR.body)
            }
          }
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          setSessionExpired(true)
        } else {
          // 403/5xx/network/unexpected — never the raw err.message (UX
          // P1-5 / scope item 12): a permission problem and a server
          // problem must read as clearly different, plain-language copy.
          const httpStatus = err instanceof ApiError ? err.status : undefined
          const folderLoadError = toUserFacingFolderLoadError(httpStatus)
          setInitError(folderLoadError)
          // P1-3 (UI polish pass): only the server/network flavor of this
          // card is the same "backend unreachable" failure useChatStore's
          // own hydration toast can also fire for on this same app load —
          // a 403 (FOLDER_LOAD_PERMISSION_ERROR) is a different, unrelated
          // failure (the backend answered just fine) and never suppresses
          // that toast. See backendUnreachableNotice.ts.
          if (folderLoadError === FOLDER_LOAD_SERVER_ERROR) {
            markUnreachableCardShown()
          }
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

  /**
   * Looks up a folder node (name + has_children) by id in the folder
   * cache built up from every folder the tree has already rendered — for
   * example the Categorize gate's "does this folder have subfolders"
   * check. Returns undefined for a folder that hasn't been loaded yet
   * (a caller should treat that as unknown, not "no subfolders").
   */
  const getFolderNode = useCallback(
    (folderId: number): BrowseFolderNode | undefined => {
      const meta = folderMeta.get(folderId)
      if (!meta) return undefined
      return {
        folder_id: folderId,
        name: meta.name,
        parent_id: meta.parent_id,
        has_children: meta.has_children,
      }
    },
    [folderMeta],
  )

  const handleSelectFolder = useCallback(
    async (folderId: number) => {
      if (cache.has(folderId)) {
        setActiveFolderId(folderId)
        persistActiveFolder(folderId)
        const docs = cache.get(folderId)?.contents.documents ?? []
        onDocumentsLoaded?.({ folderId, documents: docs, page: 0 })
        return
      }

      try {
        await loadFolder(folderId)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // Deleted meanwhile (e.g. in LogicalDOC) — never commit the
          // switch to a folder that no longer exists: stay on whichever
          // folder was active before, and drop the stale id from the tree
          // cache/metadata so it doesn't linger as a selectable node.
          message.error(FOLDER_NO_LONGER_EXISTS_WARNING)
          setCache((prev) => {
            if (!prev.has(folderId)) return prev
            const next = new Map(prev)
            next.delete(folderId)
            return next
          })
          setFolderMeta((prev) => {
            if (!prev.has(folderId)) return prev
            const next = new Map(prev)
            next.delete(folderId)
            return next
          })
          return
        }
        throw err
      }

      setActiveFolderId(folderId)
      persistActiveFolder(folderId)
    },
    [cache, loadFolder, onDocumentsLoaded],
  )

  // Shared by the TreeSelect-style loadData (folder ids only) and the
  // unified file tree (FolderSidebar), whose nodes carry a prefixed string
  // key ('folder-<id>' / 'doc-<id>') rather than a bare numeric value.
  const ensureFolderLoaded = useCallback(
    async (folderId: number) => {
      if (!Number.isFinite(folderId)) return
      if (!cache.has(folderId)) {
        await loadFolder(folderId)
      }
    },
    [cache, loadFolder],
  )

  const handleLoadTreeData = useCallback(
    async (node: TreeSelectNode) => {
      await ensureFolderLoaded(Number(node.value))
    },
    [ensureFolderLoaded],
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
        if (
          doc.indexing_status !== 'READY' &&
          doc.indexing_status !== 'FAILED' &&
          doc.indexing_status !== 'UNSUPPORTED'
        )
          return true
      }
    }
    return false
  }, [cache])

  const expandedFolderIds = useMemo(() => [...cache.keys()], [cache])

  // Every document id currently held in the cached (expanded) folders —
  // what the cheap fast-cadence status poll asks about.
  const cachedDocumentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entry of cache.values()) {
      for (const doc of entry.contents.documents) ids.add(doc.document_id)
    }
    return [...ids]
  }, [cache])

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

  // Only one browse fetch (auto poll or manual refresh) runs at a time.
  // LogicalDOC's box is small — a full folder re-fetch costs ~3 REST
  // calls per folder, so overlapping ticks (or a manual click while a
  // poll is still outstanding) must never fire a second, concurrent
  // request.
  const inFlightRef = useRef<Promise<void> | null>(null)

  // Set once the fast-cadence /browse/status call comes back 404 (the
  // endpoint disabled on the adapter) — stops calling it again for the
  // rest of the session instead of throwing on every tick. Other errors
  // (network blips, 5xx) don't set this: they're transient, so the next
  // tick should still try again.
  const fastStatusPollDisabledRef = useRef(false)

  /**
   * Auto-poll ticks: it's fine to silently skip a tick entirely if a
   * fetch (another tick, or a manual refresh) is already outstanding —
   * the next tick will pick up any change.
   */
  const runIfIdle = useCallback(async (task: () => Promise<void>) => {
    if (inFlightRef.current) return
    const promise = task()
    inFlightRef.current = promise
    try {
      await promise
    } finally {
      inFlightRef.current = null
    }
  }, [])

  /**
   * Manual refresh: the user explicitly asked for fresh data, so this
   * must always actually run — it may never silently no-op. If a poll
   * tick is already in flight it waits for that one to finish first (so
   * the two never run concurrently), then still performs its own full
   * re-fetch.
   */
  const runExclusive = useCallback(async (task: () => Promise<void>) => {
    if (inFlightRef.current) {
      await inFlightRef.current.catch(() => {})
    }
    const promise = task()
    inFlightRef.current = promise
    try {
      await promise
    } finally {
      inFlightRef.current = null
    }
  }, [])

  /** Manual refresh: re-fetch the root plus every folder the user has expanded. */
  const refreshDocumentStatuses = useCallback(async () => {
    await runExclusive(async () => {
      const ids = new Set(expandedFolderIds)
      if (rootFolderId != null) ids.add(rootFolderId)
      if (ids.size === 0) return
      await fetchAndMergeStatuses([...ids])
    })
  }, [runExclusive, expandedFolderIds, rootFolderId, fetchAndMergeStatuses])

  // Auto-refresh: poll while the /chat page is open. Cadence is
  // VITE_BROWSE_REFRESH_SECONDS (0 disables) whenever a visible document
  // hasn't settled, else the slower idle cadence. LogicalDOC load: the
  // fast cadence only calls the cheap /browse/status endpoint for ids
  // already in the cached tree; the expensive full per-folder re-fetch
  // (existing browse functions) runs only at the idle cadence and on the
  // manual refresh button above. Paused while the tab is hidden; resumes
  // immediately on visibilitychange.
  useEffect(() => {
    if (BROWSE_REFRESH_SECONDS <= 0) return undefined
    if (rootFolderId == null || expandedFolderIds.length === 0) return undefined

    const seconds = hasUnsettledDocument ? BROWSE_REFRESH_SECONDS : BROWSE_IDLE_REFRESH_SECONDS

    const pollNow = () => {
      if (document.hidden) return
      void runIfIdle(async () => {
        if (hasUnsettledDocument) {
          if (fastStatusPollDisabledRef.current) return
          if (cachedDocumentIds.length === 0) return
          const response = await fetchBrowseStatus(cachedDocumentIds)
          applyStatusPatches(response.documents)
        } else {
          await fetchAndMergeStatuses(expandedFolderIds)
        }
      }).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          if (!fastStatusPollDisabledRef.current) {
            fastStatusPollDisabledRef.current = true
            console.debug(
              '[useBrowseTree] /browse/status returned 404 — disabling the fast status poll for this session.',
            )
          }
          return
        }
        // Transient poll failure (network error, 5xx, etc.) — keep
        // showing the last-known status and try again on the next tick.
      })
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
  }, [
    rootFolderId,
    expandedFolderIds,
    hasUnsettledDocument,
    cachedDocumentIds,
    fetchAndMergeStatuses,
    applyStatusPatches,
    runIfIdle,
  ])

  return {
    username,
    rootFolderId,
    // Raw per-folder cache + metadata, for building a unified folder+file
    // tree (FolderSidebar) that needs every cached folder's document list,
    // not just the currently active one that treeSelectData/
    // activeFolderContents expose.
    cache,
    folderMeta,
    treeSelectData,
    activeFolderId,
    activeFolderName,
    activeFolderContents,
    getFolderNode,
    isInitializing,
    // Same underlying flag as `isInitializing` — exposed under this name
    // too since it's what the initial-mount loading skeleton consumes.
    initialLoading: isInitializing,
    initError,
    sessionExpired,
    isActiveFolderLoading,
    // Raw per-folder loading state (superset of isActiveFolderLoading),
    // for FolderSidebar's unified tree to show a loading indicator on
    // whichever folder node is being expanded, not just the active one.
    loadingFolderIds,
    loadingMoreFolderId,
    handleSelectFolder,
    handleLoadTreeData,
    ensureFolderLoaded,
    handleLoadMoreDocuments,
    refreshActiveFolder,
    refreshDocumentStatuses,
    applyStatusPatches,
  }
}

export type BrowseTreeState = ReturnType<typeof useBrowseTree>
