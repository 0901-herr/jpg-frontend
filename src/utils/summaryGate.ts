import type { BrowseDocumentItem } from '../api/types/browse'
import { isDocumentSelectable } from '../components/IndexingStatusBadge'

export function isSummaryReady(document: BrowseDocumentItem | undefined): boolean {
  return document?.summary_status === 'READY'
}

export function getSummarizeDisabledReason(options: {
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
  // Selected but its metadata hasn't synced yet (e.g. just after selection,
  // before the next status refresh) — the file IS selected, so this must
  // never read as "you forgot to select something".
  if (!document) return 'File not ready yet'

  // The file itself still ingesting (queued/indexing/failed) is a different
  // problem than "the summary specifically hasn't been generated" — surface
  // it as such rather than the summary-status copy below, which only makes
  // sense once the file is actually indexed.
  if (!isDocumentSelectable(document.indexing_status, document.queryable)) {
    return 'File not ready yet'
  }

  switch (document.summary_status) {
    case 'READY':
      return null
    case 'PENDING':
      return 'Summary not ready yet'
    case 'FAILED':
      return 'Summary not available'
    case 'NOT_AVAILABLE':
      return 'Summary not available'
    default:
      return 'Summary not ready yet'
  }
}
