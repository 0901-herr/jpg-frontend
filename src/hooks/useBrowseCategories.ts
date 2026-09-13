import { useEffect, useMemo, useState } from 'react'
import { fetchBrowseCategories } from '../api/browse'
import type { BrowseCategoriesResponse, BrowseDocumentItem } from '../api/types/browse'

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

  return { serverCategories, categoriesLoading }
}
