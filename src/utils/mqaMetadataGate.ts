import type { BrowseDocumentItem } from '../api/types/browse'
import { getDocumentSelectionHint, isDocumentSelectable } from '../components/IndexingStatusBadge'

/** Extract Metadata needs a document the RAG engine can query — the same
 * rule that makes a row selectable (Ready, Partial or still Indexing, and
 * queryable). It does not depend on the summary being available. */
export function isMqaMetadataReady(document: BrowseDocumentItem | undefined): boolean {
  if (!document) return false
  return isDocumentSelectable(document.indexing_status, document.queryable)
}

export function getExtractMetadataDisabledReason(options: {
  selectedCount: number
  document: BrowseDocumentItem | undefined
  isResponding: boolean
  disabled: boolean
}): string | null {
  const { selectedCount, document, isResponding, disabled } = options

  if (isResponding) return 'Wait for response to finish'
  if (disabled) return 'Sign in to continue'
  if (selectedCount === 0) return 'Select one document'
  if (selectedCount > 1) return 'Select only one document'
  if (!document) return 'Select one document'
  if (isMqaMetadataReady(document)) return null
  return getDocumentSelectionHint(document) ?? 'Document not ready yet'
}
