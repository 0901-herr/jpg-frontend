import type { LifecycleStatus } from '../api/types/admin'

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  DISCOVERED: 'Discovered',
  QUEUED: 'Queued',
  PREPARING: 'Preparing',
  STAGED: 'Staged',
  SUBMITTED: 'Submitted',
  INDEXING: 'Indexing',
  READY: 'Ready',
  FAILED: 'Failed',
  DELETING: 'Deleting',
  DELETED: 'Deleted',
}

export const LIFECYCLE_HINTS: Record<LifecycleStatus, string> = {
  DISCOVERED: 'Known to the adapter but not yet queued for ingestion',
  QUEUED: 'Waiting to be prepared or submitted to RAG',
  PREPARING: 'Downloading from LogicalDOC and staging to MinIO',
  STAGED: 'Staged in MinIO, waiting for batch submit to RAG',
  SUBMITTED: 'Accepted by RAG, waiting to start indexing',
  INDEXING: 'RAG Engine is currently processing this document',
  READY: 'Successfully indexed and searchable',
  FAILED: 'Ingestion failed',
  DELETING: 'Being removed from RAG and storage',
  DELETED: 'Removed from the searchable corpus',
}

export const LIFECYCLE_COLORS: Record<LifecycleStatus, string> = {
  DISCOVERED: 'default',
  QUEUED: 'default',
  PREPARING: 'processing',
  STAGED: 'processing',
  SUBMITTED: 'processing',
  INDEXING: 'warning',
  READY: 'success',
  FAILED: 'error',
  DELETING: 'warning',
  DELETED: 'default',
}

export function isTerminalLifecycle(status: LifecycleStatus): boolean {
  return status === 'READY' || status === 'FAILED' || status === 'DELETED'
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds} sec ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

export function computeProgressLabel(
  ready: number,
  totalKnown: number | null,
  discoveredSoFar: number,
  traversalComplete: boolean,
): { percent: number | null; label: string } {
  if (traversalComplete && totalKnown != null && totalKnown > 0) {
    const percent = Math.min(100, Math.round((ready / totalKnown) * 100))
    return {
      percent,
      label: `${ready.toLocaleString()} READY out of ${totalKnown.toLocaleString()} total`,
    }
  }
  const denominator = Math.max(discoveredSoFar, ready)
  if (denominator <= 0) {
    return { percent: null, label: 'No documents discovered yet' }
  }
  const percent = Math.min(100, Math.round((ready / denominator) * 100))
  return {
    percent,
    label: `${ready.toLocaleString()} READY out of ${denominator.toLocaleString()} currently discovered (traversal in progress)`,
  }
}
