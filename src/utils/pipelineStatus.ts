import type { IngestionOverview } from '../api/types/admin'

export type PipelinePhase = 'idle' | 'crawling' | 'ingesting' | 'failed'

export interface PipelineStatus {
  phase: PipelinePhase
  label: string
  detail: string
  isActive: boolean
}

function pipelineInFlight(counts: IngestionOverview['counts']): number {
  return (
    counts.discovered +
    counts.staged +
    counts.preparing +
    counts.indexing +
    (counts.retrying ?? 0)
  )
}

export function derivePipelineStatus(overview: IngestionOverview): PipelineStatus {
  const bulk = overview.bulk_progress
  const counts = overview.counts
  const inFlight = pipelineInFlight(counts)

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
      label: 'Document scan failed',
      detail: bulk.job_error ?? 'See Activity tab for details. Press start to retry.',
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
    if ((counts.retrying ?? 0) > 0) parts.push(`${counts.retrying} retrying`)
    if (counts.discovered > 0) parts.push(`${counts.discovered} queued`)
    return {
      phase: 'ingesting',
      label: 'Ingesting documents',
      detail: `${parts.join(', ')}. Folder scan finished; indexing still in progress.`,
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
  if (pipelineInFlight(counts) > 0) return true
  if (overview.overall_state === 'RUNNING') return true
  return false
}

export function pipelineGatesPaused(overview: IngestionOverview): boolean {
  return overview.discovery_state === 'PAUSED' && overview.ingestion_state === 'PAUSED'
}

/** Primary pipeline control shown on the progress card. */
export function pipelinePrimaryAction(overview: IngestionOverview): 'start' | 'pause' | 'resume' {
  if (pipelineGatesPaused(overview)) return 'resume'
  if (derivePipelineStatus(overview).isActive) return 'pause'
  return 'start'
}

export const PIPELINE_PROGRESS_INTRO =
  'Documents being prepared for AI search. Press start to begin. Counts below show where each file is.'

/** Short section intro for the progress card — counts carry the detail. */
export function pipelineProgressIntro(overview: IngestionOverview): string {
  if (pipelineGatesPaused(overview)) {
    return 'Ingestion is paused. Files already in progress may still finish. Counts below keep updating.'
  }
  if (overview.bulk_progress?.job_state === 'failed') {
    const error = overview.bulk_progress.job_error
    return error
      ? `Last scan failed (${error}). Press start to retry.`
      : 'Last scan failed. Press start to retry.'
  }
  return PIPELINE_PROGRESS_INTRO
}

export function pipelineCorpusTotal(overview: IngestionOverview): number {
  const { counts, bulk_progress: bulk } = overview
  const fromCounts =
    counts.discovered +
    counts.staged +
    counts.preparing +
    counts.indexing +
    (counts.retrying ?? 0) +
    counts.ready
  if (bulk?.job_state === 'running') {
    return Math.max(bulk.total_discovered ?? 0, fromCounts)
  }
  return fromCounts
}

export function shouldShowProgressBar(overview: IngestionOverview): boolean {
  const { counts, bulk_progress: bulk } = overview
  if (bulk?.job_state === 'running') return true
  if (counts.ready <= 0) return false
  return pipelineCorpusTotal(overview) > 0
}
