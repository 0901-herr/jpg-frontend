import type { IngestionOverview } from '../api/types/admin'

export type PipelinePhase = 'idle' | 'crawling' | 'ingesting' | 'failed'

export interface PipelineStatus {
  phase: PipelinePhase
  label: string
  detail: string
  isActive: boolean
}

export function derivePipelineStatus(overview: IngestionOverview): PipelineStatus {
  const bulk = overview.bulk_progress
  const counts = overview.counts
  const inFlight =
    counts.discovered + counts.staged + counts.preparing + counts.indexing

  if (bulk?.job_state === 'running') {
    const discovered = bulk.total_discovered ?? 0
    return {
      phase: 'crawling',
      label: 'Crawling LogicalDOC',
      detail: `${discovered} document(s) discovered so far. Progress updates automatically.`,
      isActive: true,
    }
  }

  if (bulk?.job_state === 'failed') {
    return {
      phase: 'failed',
      label: 'Bulk crawl failed',
      detail: bulk.job_error ?? 'See Activity tab for details. Click Start ingesting to retry.',
      isActive: false,
    }
  }

  if (counts.discovered > 0 && inFlight === counts.discovered) {
    return {
      phase: 'ingesting',
      label: 'Waiting to ingest',
      detail: `${counts.discovered} document(s) registered in the adapter but not yet scheduled to RAG. Pipeline steppers stay on Discovered until Temporal picks them up.`,
      isActive: true,
    }
  }

  if (inFlight > 0) {
    const parts: string[] = []
    if (counts.preparing > 0) parts.push(`${counts.preparing} preparing`)
    if (counts.staged > 0) parts.push(`${counts.staged} staged`)
    if (counts.indexing > 0) parts.push(`${counts.indexing} indexing`)
    if (counts.discovered > 0) parts.push(`${counts.discovered} queued`)
    return {
      phase: 'ingesting',
      label: 'Ingesting documents',
      detail: `${parts.join(', ')}. Bulk crawl finished; RAG pipeline still working.`,
      isActive: true,
    }
  }

  if (counts.ready > 0) {
    return {
      phase: 'idle',
      label: 'Idle',
      detail: `${counts.ready} document(s) ready. Click Start ingesting to pick up new LogicalDOC uploads.`,
      isActive: false,
    }
  }

  return {
    phase: 'idle',
    label: 'Idle',
    detail: 'No documents in the pipeline. Click Start ingesting to traverse LogicalDOC and queue them.',
    isActive: false,
  }
}

export function overviewShouldPollFast(overview: IngestionOverview | undefined): boolean {
  if (!overview) return false
  if (overview.bulk_progress?.job_state === 'running') return true
  const counts = overview.counts
  const inFlight =
    counts.discovered +
    counts.staged +
    counts.preparing +
    counts.indexing
  if (inFlight > 0 && counts.ready === 0) return true
  return counts.preparing + counts.staged + counts.indexing > 0
}
