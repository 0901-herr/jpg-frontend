import type { AdminDocumentSummary, LifecycleStatus } from '../api/types/admin'
import { isTerminalLifecycle, LIFECYCLE_HINTS, LIFECYCLE_LABELS } from './lifecycle'

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error'

export interface ActivityEntry {
  id: string
  at: string
  level: ActivityLevel
  headline: string
  detail?: string
  docId?: string
  lifecycleStatus?: LifecycleStatus
}

function levelForStatus(status: LifecycleStatus): ActivityLevel {
  if (status === 'READY') return 'success'
  if (status === 'FAILED') return 'error'
  if (status === 'INDEXING' || status === 'SUBMITTED' || status === 'PREPARING') return 'warning'
  return 'info'
}

function docLabel(doc: AdminDocumentSummary): string {
  const name = doc.filename ?? `doc ${doc.source_document_id}`
  return `${name} (${doc.source_document_id})`
}

/** Expand one document row into timeline events from known timestamps. */
export function buildDocumentActivityEvents(doc: AdminDocumentSummary): ActivityEntry[] {
  const label = docLabel(doc)
  const events: ActivityEntry[] = []

  const add = (
    at: string | null | undefined,
    headline: string,
    level: ActivityLevel,
    detail?: string,
  ) => {
    if (!at) return
    events.push({
      id: `${doc.source_document_id}-${headline}-${at}`,
      at,
      level,
      headline,
      detail,
      docId: doc.source_document_id,
      lifecycleStatus: doc.lifecycle_status,
    })
  }

  add(doc.discovered_at, `${label} discovered`, 'info', doc.discovery_source ?? undefined)
  add(doc.submitted_at, `${label} submitted to RAG`, 'info', doc.rag_document_id ?? undefined)
  add(doc.ready_at, `${label} ready`, 'success', 'Indexed and searchable')
  add(
    doc.failed_at,
    `${label} failed`,
    'error',
    doc.last_error ?? doc.last_error_code ?? undefined,
  )

  const status = doc.lifecycle_status
  if (!isTerminalLifecycle(status) && doc.updated_at) {
    add(
      doc.updated_at,
      `${label}: ${LIFECYCLE_LABELS[status]}`,
      levelForStatus(status),
      LIFECYCLE_HINTS[status],
    )
  }

  return events
}

export interface SystemActivityEvent {
  id: string
  at: string
  level: ActivityLevel
  headline: string
  detail?: string | null
  category?: string
}

function bulkOverviewEvent(
  bulk: { job_state: string; job_error?: string | null; total_discovered?: number } | null | undefined,
): SystemActivityEvent | null {
  if (!bulk || bulk.job_state === 'idle') return null
  if (bulk.job_state === 'running') {
    return {
      id: 'bulk-running',
      at: new Date().toISOString(),
      level: 'warning',
      headline: 'Bulk crawl running',
      detail: `${bulk.total_discovered ?? 0} document(s) discovered so far`,
      category: 'bulk',
    }
  }
  if (bulk.job_state === 'failed') {
    return {
      id: 'bulk-failed',
      at: new Date().toISOString(),
      level: 'error',
      headline: 'Bulk crawl failed',
      detail: bulk.job_error ?? 'Unknown error',
      category: 'bulk',
    }
  }
  if (bulk.job_state === 'completed') {
    return {
      id: 'bulk-completed',
      at: new Date().toISOString(),
      level: 'success',
      headline: 'Bulk crawl completed',
      detail: `${bulk.total_discovered ?? 0} document(s) discovered`,
      category: 'bulk',
    }
  }
  return null
}

export function mergeActivityFeed(
  documents: AdminDocumentSummary[],
  systemEvents: SystemActivityEvent[] = [],
  bulkProgress?: { job_state: string; job_error?: string | null; total_discovered?: number } | null,
  limit = 80,
): ActivityEntry[] {
  const bulkEvent = bulkOverviewEvent(bulkProgress)
  const mergedSystem = bulkEvent ? [bulkEvent, ...systemEvents] : systemEvents
  const fromSystem: ActivityEntry[] = mergedSystem.map((event) => ({
    id: event.id,
    at: event.at,
    level: event.level,
    headline: event.headline,
    detail: event.detail ?? undefined,
  }))

  return [...documents.flatMap(buildDocumentActivityEvents), ...fromSystem]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
}

function dayKey(at: string): string {
  const date = new Date(at)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatActivityDayLabel(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatActivityTime(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export interface ActivityDayGroup {
  dayKey: string
  label: string
  entries: ActivityEntry[]
}

/** Group a newest-first feed into day sections (newest days first). */
export function groupActivityByDay(entries: ActivityEntry[]): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = []
  const indexByDay = new Map<string, number>()

  for (const entry of entries) {
    const key = dayKey(entry.at)
    const existing = indexByDay.get(key)
    if (existing === undefined) {
      indexByDay.set(key, groups.length)
      groups.push({ dayKey: key, label: formatActivityDayLabel(entry.at), entries: [entry] })
    } else {
      groups[existing]!.entries.push(entry)
    }
  }

  return groups
}
