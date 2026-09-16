import type { BrowseDocumentItem, BrowseFolderNode } from '../api/types/browse'
import { isDocumentSelectable } from '../components/IndexingStatusBadge'

/** Categorize needs a document the RAG engine can query, same as the row's
 * selectability rule. `folder` is the folder node for the selected
 * document's `folder_id`, looked up in the browse tree's folder cache —
 * `undefined` when that folder hasn't been loaded yet (the button stays
 * enabled in that case; the adapter's 409 for a leaf folder is the
 * backstop). */
export function getCategorizeDisabledReason(options: {
  selectedCount: number
  document: BrowseDocumentItem | undefined
  folder: BrowseFolderNode | undefined
  isResponding: boolean
  disabled: boolean
}): string | null {
  const { selectedCount, document, folder, isResponding, disabled } = options

  if (isResponding) return 'Wait for response to finish'
  if (disabled) return 'Sign in to continue'
  if (selectedCount === 0) return 'Select one file'
  if (selectedCount > 1) return 'Select only one file'
  if (!document || !isDocumentSelectable(document.indexing_status, document.queryable)) {
    return 'File not ready yet'
  }
  if (folder && !folder.has_children) {
    return 'Already categorized'
  }
  return null
}
