import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchBrowseCategories } from '../api/browse'
import type { BrowseCategoriesResponse, BrowseDocumentItem } from '../api/types/browse'
import { BROWSE_IDLE_REFRESH_SECONDS, BROWSE_REFRESH_SECONDS } from '../config/browse'

interface UseBrowseCategoriesOptions {
  enabled: boolean
  activeFolderId: number | null
  refreshActiveFolder: () => Promise<void>
}

export function useBrowseCategories(
  folderDocuments: BrowseDocumentItem[],
  { enabled, activeFolderId, refreshActiveFolder }: UseBrowseCategoriesOptions,
) {
  const [serverCategories, setServerCategories] = useState<BrowseCategoriesResponse | null>(null)
  const [categoriesLoading, setCategoriesLoading] = useState(false)

  const documentIdsKey = useMemo(
    () =>
      folderDocuments
        .map((doc) => doc.document_id)
        .sort()
        .join(','),
    [folderDocuments],
  )

  useEffect(() => {
    if (!enabled || folderDocuments.length === 0) {
      setServerCategories(null)
      setCategoriesLoading(false)
      return
    }

    const controller = new AbortController()
    setCategoriesLoading(true)

    ;(async () => {
      try {
        const result = await fetchBrowseCategories(
          folderDocuments.map((doc) => doc.document_id),
          controller.signal,
        )
        if (controller.signal.aborted) return

        setServerCategories(result)
        if (activeFolderId != null) {
          await refreshActiveFolder()
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setServerCategories(null)
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false)
        }
      }
    })()

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- documentIdsKey tracks folderDocuments ids
  }, [enabled, documentIdsKey, activeFolderId, refreshActiveFolder])

  // Only one poll tick runs at a time — a slow request spanning multiple
  // ticks must not fire a second, overlapping one.
  const inFlightRef = useRef<Promise<void> | null>(null)

  // Auto-refresh while in category mode, on the same cadence as the
  // sidebar tree. LogicalDOC load: useBrowseTree's own fast-cadence poll
  // (src/hooks/useBrowseTree.ts) already calls the cheap /browse/status
  // endpoint for every cached document id — a superset of this folder's,
  // since the active folder must be cached for folderDocuments to be
  // non-empty at all — and patches the shared cache folderDocuments is
  // itself derived from. So the fast cadence here is a no-op: it exists
  // only to keep re-checking (via the effect's own deps) whether every
  // document has settled yet. Only the full/expensive fetchBrowseCategories
  // re-fetch (existing browse function) actually runs, at the slower idle
  // cadence once settled — no need to duplicate the status call too.
  // Paused while hidden.
  useEffect(() => {
    if (!enabled || folderDocuments.length === 0) return undefined
    if (BROWSE_REFRESH_SECONDS <= 0) return undefined

    const hasUnsettled = folderDocuments.some(
      (doc) => doc.indexing_status !== 'READY' && doc.indexing_status !== 'FAILED',
    )
    const seconds = hasUnsettled ? BROWSE_REFRESH_SECONDS : BROWSE_IDLE_REFRESH_SECONDS
    const documentIds = folderDocuments.map((doc) => doc.document_id)

    // Skip-if-busy: `poll` is the ONLY caller of this guard (interval tick
    // or a visibilitychange resume) — there is no separate "manual, must
    // never no-op" caller here the way useBrowseTree's refreshDocumentStatuses
    // is for its own poll. The manual refresh button re-fetches through
    // useBrowseTree.refreshDocumentStatuses directly and never touches this
    // guard, so silently skipping an overlapping tick is safe: the next
    // interval tick (or the next visibilitychange) still runs and no
    // user-initiated action is ever dropped. Named to match useBrowseTree's
    // runIfIdle for the same skip-if-busy semantics.
    const runIfIdle = async (task: () => Promise<void>) => {
      if (inFlightRef.current) return
      const promise = task()
      inFlightRef.current = promise
      try {
        await promise
      } finally {
        inFlightRef.current = null
      }
    }

    const poll = () => {
      if (document.hidden) return
      if (hasUnsettled) {
        // No fetch of our own here — useBrowseTree's fast poll already
        // covers these ids and folderDocuments will reflect its patches
        // on the next render, which re-runs this effect (see deps below).
        return
      }
      void runIfIdle(async () => {
        const result = await fetchBrowseCategories(documentIds)
        setServerCategories(result)
      }).catch(() => {
        // Transient poll failure — keep showing the last-known categories.
      })
    }

    const intervalId = setInterval(poll, seconds * 1000)
    const handleVisibility = () => {
      if (!document.hidden) poll()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- documentIdsKey tracks folderDocuments ids
  }, [enabled, documentIdsKey, folderDocuments])

  return { serverCategories, categoriesLoading }
}
