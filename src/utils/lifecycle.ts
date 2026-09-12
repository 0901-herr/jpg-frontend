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

/** Ordered ingestion pipeline stages for waterfall UI. */
export const PIPELINE_STAGES = [
  { id: 'discovered', shortLabel: 'Discovered', label: 'Discovered in LogicalDOC' },
  { id: 'queued', shortLabel: 'Queued', label: 'Queued for ingestion' },
  { id: 'preparing', shortLabel: 'Preparing', label: 'Downloading from LogicalDOC' },
  { id: 'staged', shortLabel: 'Staged', label: 'Staged for RAG submit' },
  { id: 'submitted', shortLabel: 'Submitted', label: 'Submitted to RAG Engine' },
  { id: 'indexing', shortLabel: 'Indexing', label: 'Indexing in RAG Engine' },
  { id: 'ready', shortLabel: 'Ready', label: 'Searchable in RAG' },
] as const

export type PipelineStageState = 'pending' | 'complete' | 'current' | 'failed' | 'skipped'

const STATUS_STAGE_INDEX: Record<LifecycleStatus, number> = {
  DISCOVERED: 0,
  QUEUED: 1,
  PREPARING: 2,
  STAGED: 3,
  SUBMITTED: 4,
  INDEXING: 5,
  READY: 6,
  FAILED: -1,
  DELETING: 6,
  DELETED: 6,
}

type PipelineDocTimestamps = Pick<
  import('../api/types/admin').AdminDocumentSummary,
  'discovered_at' | 'submitted_at' | 'ready_at' | 'failed_at'
>

/** Infer the stage where a FAILED document stopped (best-effort from timestamps). */
export function inferFailedStageIndex(doc?: PipelineDocTimestamps): number {
  if (!doc) return 2
  if (doc.ready_at) return 6
  if (doc.submitted_at) return 5
  if (doc.discovered_at) return 2
  return 1
}

export function getPipelineProgress(
  status: LifecycleStatus,
  doc?: PipelineDocTimestamps,
): { states: PipelineStageState[]; summary: string } {
  const stageCount = PIPELINE_STAGES.length
  let activeIndex = STATUS_STAGE_INDEX[status]
  let failed = false

  if (status === 'FAILED') {
    failed = true
    activeIndex = inferFailedStageIndex(doc)
  } else if (status === 'DELETING') {
    activeIndex = 6
  } else if (status === 'DELETED') {
    activeIndex = 6
  }

  const states: PipelineStageState[] = PIPELINE_STAGES.map((_, index) => {
    if (failed) {
      if (index < activeIndex) return 'complete'
      if (index === activeIndex) return 'failed'
      return 'pending'
    }
    if (status === 'READY' || status === 'DELETED') return 'complete'
    if (status === 'DELETING' && index === stageCount - 1) return 'current'
    if (index < activeIndex) return 'complete'
    if (index === activeIndex) return 'current'
    return 'pending'
  })

  const summary =
    status === 'FAILED'
      ? `Failed at ${PIPELINE_STAGES[activeIndex]?.label ?? 'unknown stage'}`
      : status === 'READY'
        ? 'Fully indexed and searchable'
        : status === 'DELETED'
          ? 'Removed from corpus'
          : `${PIPELINE_STAGES[activeIndex]?.label ?? status} (in progress)`

  return { states, summary }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'None'
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
