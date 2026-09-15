import type { BrowseDocumentItem } from '../api/types/browse'

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
  if (!document) return 'Select one document'

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
