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
  const retrying = counts.retrying ?? 0

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
      key: 'retrying',
      title: 'Retrying',
      value: retrying,
      hint: `${retrying.toLocaleString()} hit a temporary error and will be tried again.`,
      valueStyle: { color: retrying ? '#d48806' : undefined },
    },
    {
      key: 'ready',
      title: 'Ready',
      value: counts.ready,
      hint: `${counts.ready.toLocaleString()} fully indexed and available in AI search.`,
      valueStyle: { color: '#389e0d' },
    },
    {
      key: 'partial',
      title: 'Partial',
      value: counts.partial,
      hint: `${counts.partial.toLocaleString()} searchable with incomplete indexing — answers may be less accurate.`,
      valueStyle: { color: counts.partial ? '#0284c7' : undefined },
    },
    {
      key: 'failed',
      title: 'Failed',
      value: counts.failed,
      hint: `${counts.failed.toLocaleString()} could not be indexed. Retry from the Failures tab.`,
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
