import type { BrowseDocumentItem } from '../api/types/browse'

/** Extract Metadata reuses Summarize's exact readiness signal (no separate
 * MQA status field exists on BrowseDocumentItem yet) — see summaryGate.ts. */
export function isMqaMetadataReady(document: BrowseDocumentItem | undefined): boolean {
  return document?.summary_status === 'READY'
}

export function getExtractMetadataDisabledReason(options: {
  selectedCount: number
  document: BrowseDocumentItem | undefined
  isResponding: boolean
  disabled: boolean
}): string | null {
  const { selectedCount, document, isResponding, disabled } = options

  if (isResponding) return 'Wait for the current response to finish'
  if (disabled) return 'Sign in to extract metadata'
  if (selectedCount === 0) return 'Select a document to extract metadata'
  if (selectedCount > 1) return 'Select only one document to extract metadata'
  if (!document) return 'Select a document to extract metadata'

  switch (document.summary_status) {
    case 'READY':
      return null
    case 'PENDING':
      return 'Document is still being processed'
    case 'FAILED':
      return 'Metadata is not available for this document'
    case 'NOT_AVAILABLE':
      return 'Metadata is not available for this document'
    default:
      return 'Document is not ready for extraction yet'
  }
}
