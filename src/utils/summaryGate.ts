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

  if (isResponding) return 'Wait for the current response to finish'
  if (disabled) return 'Sign in to summarize documents'
  if (selectedCount === 0) return 'Select a document to summarize'
  if (selectedCount > 1) return 'Select only one document to summarize'
  if (!document) return 'Select a document to summarize'

  switch (document.summary_status) {
    case 'READY':
      return null
    case 'PENDING':
      return 'Summary is still being generated'
    case 'FAILED':
      return 'Summary is not available for this document'
    case 'NOT_AVAILABLE':
      return 'Summary is not available for this document'
    default:
      return 'Summary is not ready for this document yet'
  }
}
