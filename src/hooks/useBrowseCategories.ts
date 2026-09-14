import { useEffect, useMemo, useState } from 'react'
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

  // Auto-refresh: re-fetch category groupings on the same schedule as the
  // sidebar tree while in category mode, so counts stay current as
  // classification finishes. Cadence is VITE_BROWSE_REFRESH_SECONDS (0
  // disables) while a document hasn't settled, else the slower idle
  // cadence. Paused while the tab is hidden.
  useEffect(() => {
    if (!enabled || folderDocuments.length === 0) return undefined
    if (BROWSE_REFRESH_SECONDS <= 0) return undefined

    const hasUnsettled = folderDocuments.some(
      (doc) => doc.indexing_status !== 'READY' && doc.indexing_status !== 'FAILED',
    )
    const seconds = hasUnsettled ? BROWSE_REFRESH_SECONDS : BROWSE_IDLE_REFRESH_SECONDS

    const poll = () => {
      if (document.hidden) return
      fetchBrowseCategories(folderDocuments.map((doc) => doc.document_id))
        .then((result) => setServerCategories(result))
        .catch(() => {
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
