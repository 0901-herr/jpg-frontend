import type { CSSProperties } from 'react'
import type { IngestionOverview } from '../api/types/admin'

export interface ProgressMetricContext {
  overview: IngestionOverview
  discoveredSoFar: number
  queued: number
}

export interface ProgressMetric {
  key: string
  title: string
  value: number
  hint: string
  valueStyle?: CSSProperties
}

export function buildProgressMetrics(ctx: ProgressMetricContext): ProgressMetric[] {
  const { discoveredSoFar, queued } = ctx
  const { counts } = ctx.overview

  return [
    {
      key: 'discovered',
      title: 'Discovered',
      value: discoveredSoFar,
      hint: `${discoveredSoFar.toLocaleString()} found in your document library and registered for processing.`,
    },
    {
      key: 'queued',
      title: 'Queued',
      value: queued,
      hint: `${queued.toLocaleString()} waiting their turn (${counts.discovered.toLocaleString()} newly found, ${counts.staged.toLocaleString()} prepared and waiting to send).`,
    },
    {
      key: 'preparing',
      title: 'Preparing',
      value: counts.preparing,
      hint: `${counts.preparing.toLocaleString()} being downloaded and prepared for search.`,
    },
    {
      key: 'staged',
      title: 'Staged',
      value: counts.staged,
      hint: `${counts.staged.toLocaleString()} prepared and waiting to be sent for indexing.`,
    },
    {
      key: 'indexing',
      title: 'Indexing',
      value: counts.indexing,
      hint: `${counts.indexing.toLocaleString()} currently being indexed and made searchable.`,
      valueStyle: { color: '#d48806' },
    },
    {
      key: 'ready',
      title: 'Ready',
      value: counts.ready,
      hint: `${counts.ready.toLocaleString()} fully indexed and available in AI search.`,
      valueStyle: { color: '#389e0d' },
    },
    {
      key: 'failed',
      title: 'Failed',
      value: counts.failed,
      hint: `${counts.failed.toLocaleString()} could not be indexed. Retry from Maintenance below.`,
      valueStyle: { color: counts.failed ? '#cf1322' : undefined },
    },
    {
      key: 'deleted',
      title: 'Deleted',
      value: counts.deleted,
      hint: `${counts.deleted.toLocaleString()} removed from search results.`,
    },
  ]
}
