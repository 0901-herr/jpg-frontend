import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchBrowseCategories, fetchBrowseStatus } from '../api/browse'
import type { BrowseCategoriesResponse, BrowseDocumentItem, BrowseStatusItem } from '../api/types/browse'
import { BROWSE_IDLE_REFRESH_SECONDS, BROWSE_REFRESH_SECONDS } from '../config/browse'

interface UseBrowseCategoriesOptions {
  enabled: boolean
  activeFolderId: number | null
  refreshActiveFolder: () => Promise<void>
  /** Merges cheap /browse/status patches into the sidebar tree's cache (from useBrowseTree). */
  applyStatusPatches: (patches: BrowseStatusItem[]) => void
}

export function useBrowseCategories(
  folderDocuments: BrowseDocumentItem[],
  { enabled, activeFolderId, refreshActiveFolder, applyStatusPatches }: UseBrowseCategoriesOptions,
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
  // sidebar tree. LogicalDOC load: the fast cadence calls ONLY the cheap
  // /browse/status endpoint for the ids currently listed here, merging
  // into the shared tree cache (so badges update without a full re-fetch);
  // the full/expensive fetchBrowseCategories re-fetch (existing browse
  // function) runs only at the slower idle cadence. Paused while hidden.
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
      void runIfIdle(async () => {
        if (hasUnsettled) {
          const result = await fetchBrowseStatus(documentIds)
          applyStatusPatches(result.documents)
        } else {
          const result = await fetchBrowseCategories(documentIds)
          setServerCategories(result)
        }
      }).catch(() => {
        // Transient poll failure — keep showing the last-known categories/status.
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
  }, [enabled, documentIdsKey, folderDocuments, applyStatusPatches])

  return { serverCategories, categoriesLoading }
}
