import type { AdminDocumentSummary, LifecycleStatus } from '../api/types/admin'
import { isTerminalLifecycle } from './lifecycle'

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error'
export type ActivityKind =
  | 'discovery'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'sync'
  | 'action'
  | 'system'

export interface ActivityEntry {
  id: string
  at: string
  level: ActivityLevel
  kind: ActivityKind
  headline: string
  detail?: string
  docId?: string
  lifecycleStatus?: LifecycleStatus
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value)
}

function folderLabel(doc: AdminDocumentSummary): string {
  if (doc.source_folder_name?.trim()) {
    return doc.source_folder_name.trim()
  }
  const path = doc.file_path?.trim()
  if (path && !isNumericId(path)) {
    const parts = path.split('/').filter(Boolean)
    // Prefer the parent folder when path looks like …/Folder/file.ext
    if (parts.length >= 2 && parts[parts.length - 1]!.includes('.')) {
      return parts[parts.length - 2]!
    }
    if (parts.length >= 1) {
      return parts[parts.length - 1]!
    }
  }
  const folderId =
    doc.source_folder_id ?? (path && isNumericId(path) ? Number(path) : null)
  if (folderId != null) {
    return `Folder ${folderId}`
  }
  return 'Unknown folder'
}

function capitalizeHeadline(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function folderKey(doc: AdminDocumentSummary): string {
  if (doc.source_folder_id != null) {
    return `id:${doc.source_folder_id}`
  }
  return `name:${folderLabel(doc)}`
}

function latestTimestamp(docs: AdminDocumentSummary[]): string {
  let latest = ''
  for (const doc of docs) {
    for (const value of [doc.ready_at, doc.failed_at, doc.submitted_at, doc.discovered_at, doc.updated_at]) {
      if (value && value > latest) latest = value
    }
  }
  return latest || new Date().toISOString()
}

function joinSentences(sentences: string[]): string {
  return sentences.filter(Boolean).join(' ')
}

function folderStatusDetail(
  ready: number,
  failed: number,
  inFlight: number,
  total: number,
  retrying: number,
  failedReasons: string[],
): string {
  const sentences: string[] = []
  if (ready > 0) {
    sentences.push(
      ready === 1
        ? '1 file in this folder is ready to search.'
        : `${ready.toLocaleString()} files in this folder are ready to search.`,
    )
  }
  if (failed > 0) {
    sentences.push(
      failed === 1
        ? '1 file in this folder failed to index.'
        : `${failed.toLocaleString()} files in this folder failed to index.`,
    )
    if (failedReasons.length === 1) {
      sentences.push(`Reason: ${failedReasons[0]}.`)
    } else if (failedReasons.length > 1) {
      const shown = failedReasons.slice(0, 2)
      const more = failedReasons.length - shown.length
      sentences.push(
        more > 0
          ? `Reasons include: ${shown.join('; ')} (+${more} more).`
          : `Reasons include: ${shown.join('; ')}.`,
      )
    }
  }
  if (retrying > 0) {
    sentences.push(
      retrying === 1
        ? '1 file in this folder is waiting to be retried.'
        : `${retrying.toLocaleString()} files in this folder are waiting to be retried.`,
    )
  }
  if (inFlight > 0) {
    sentences.push(
      inFlight === 1
        ? '1 file in this folder is still being indexed.'
        : `${inFlight.toLocaleString()} files in this folder are still being indexed.`,
    )
  }
  if (sentences.length === 0 && total > 0) {
    sentences.push(`${total.toLocaleString()} files in this folder are tracked.`)
  }
  return joinSentences(sentences)
}

/** One Activity line per folder instead of one line per file. */
export function buildFolderActivityEvents(documents: AdminDocumentSummary[]): ActivityEntry[] {
  const byFolder = new Map<string, AdminDocumentSummary[]>()
  for (const doc of documents) {
    const key = folderKey(doc)
    const group = byFolder.get(key)
    if (group) group.push(doc)
    else byFolder.set(key, [doc])
  }

  const entries: ActivityEntry[] = []
  for (const [key, docs] of byFolder) {
    const label = folderLabel(docs[0]!)
    const ready = docs.filter((doc) => doc.lifecycle_status === 'READY').length
    const failedDocs = docs.filter((doc) => doc.lifecycle_status === 'FAILED')
    const failed = failedDocs.length
    const retrying = docs.filter((doc) => doc.lifecycle_status === 'RETRYING').length
    const inFlight = docs.filter(
      (doc) =>
        !isTerminalLifecycle(doc.lifecycle_status) && doc.lifecycle_status !== 'RETRYING',
    ).length
    const total = docs.length
    const done = ready + failed
    const at = latestTimestamp(docs)

    const failedReasons = [
      ...new Set(
        failedDocs
          .map((doc) => (doc.last_error || doc.last_error_code || '').trim())
          .filter(Boolean),
      ),
    ]

    const detail = folderStatusDetail(ready, failed, inFlight, total, retrying, failedReasons)

    if (inFlight === 0 && retrying === 0 && done > 0) {
      entries.push({
        id: `folder-${key}-done`,
        at,
        level: failed > 0 ? 'warning' : 'success',
        kind: failed > 0 ? 'failed' : 'completed',
        headline:
          failed > 0 ? `Folder “${label}” finished with errors` : `Folder “${label}” is fully indexed`,
        detail,
      })
      continue
    }

    if (done > 0 || inFlight > 0 || retrying > 0) {
      entries.push({
        id: `folder-${key}-progress`,
        at,
        level: failed > 0 || retrying > 0 ? 'warning' : 'info',
        kind: failed > 0 ? 'failed' : 'processing',
        headline: `Folder “${label}” is being indexed (${done.toLocaleString()}/${total.toLocaleString()} complete)`,
        detail,
      })
    }
  }

  return entries
}

/** @deprecated Prefer buildFolderActivityEvents — kept for older call sites/tests. */
export function buildDocumentActivityEvents(doc: AdminDocumentSummary): ActivityEntry[] {
  return buildFolderActivityEvents([doc])
}

export interface SystemActivityEvent {
  id: string
  at: string
  level: ActivityLevel
  headline: string
  detail?: string | null
  category?: string
  action?: string
}

function systemActivityKind(event: SystemActivityEvent): ActivityKind {
  if (event.level === 'error') return 'failed'
  if (event.category === 'audit' || event.category === 'reconcile') return 'sync'
  if (event.action === 'bulk_start' || event.action === 'bulk_completed') return 'completed'
  if (event.category === 'operator') return 'action'
  if (event.category === 'system') return 'system'
  if (event.level === 'success') return 'completed'
  return event.level === 'warning' ? 'processing' : 'system'
}

function parseAuditPollMetrics(event: SystemActivityEvent): {
  eventsRead: number
  skipped: number
  queued?: number
  deletes?: number
} | null {
  const detail = event.detail?.trim()
  if (!detail) return null
  const match = detail.match(
    /events_read=(\d+),\s*skipped=(\d+)(?:,\s*queued=(\d+))?(?:,\s*deletes=(\d+))?/i,
  )
  if (!match) return null
  const headlineQueued = event.headline?.match(/queued (\d+) document/i)?.[1]
  return {
    eventsRead: Number(match[1]),
    skipped: Number(match[2]),
    queued: match[3] != null ? Number(match[3]) : headlineQueued != null ? Number(headlineQueued) : undefined,
    deletes: match[4] != null ? Number(match[4]) : undefined,
  }
}

/** Plain-language audit poll subtitle for Activity log rows. */
export function formatAuditPollDetail(
  eventsRead: number,
  skipped: number,
  queued?: number,
  deletes?: number,
): string {
  const sentences: string[] = []

  if (eventsRead === 0) {
    sentences.push('No new LogicalDOC audit activity was found.')
  } else if (eventsRead === 1) {
    sentences.push('LogicalDOC reported 1 audit event.')
  } else {
    sentences.push(`LogicalDOC reported ${eventsRead.toLocaleString()} audit events.`)
  }

  if (skipped > 0) {
    sentences.push(
      skipped === 1
        ? '1 event was ignored (for example an excluded folder or a schedule failure).'
        : `${skipped.toLocaleString()} events were ignored (for example excluded folders or schedule failures).`,
    )
  }

  const q = queued ?? 0
  if (q > 0) {
    sentences.push(
      q === 1
        ? '1 file was queued for re-indexing.'
        : `${q.toLocaleString()} files were queued for re-indexing.`,
    )
  } else if (q === 0 && eventsRead > 0) {
    sentences.push('No files were queued for re-indexing.')
  }

  const d = deletes ?? 0
  if (d > 0) {
    sentences.push(
      d === 1 ? '1 file was removed from the index.' : `${d.toLocaleString()} files were removed from the index.`,
    )
  }

  return joinSentences(sentences)
}

function userFriendlySystemHeadline(event: SystemActivityEvent): string {
  if (event.action === 'mock_mode') return 'Sample data is active'
  if (event.action === 'audit_poll_failed') {
    return event.headline?.trim() || 'LogicalDOC change check failed'
  }
  if (event.action === 'audit_poll') {
    if (/restored/i.test(event.headline ?? '')) return 'LogicalDOC change check restored'
    const metrics = parseAuditPollMetrics(event)
    if (metrics?.queued === 1) return '1 file queued for re-indexing'
    if (metrics?.queued != null && metrics.queued > 1) {
      return `${metrics.queued.toLocaleString()} files queued for re-indexing`
    }
    if (metrics && metrics.eventsRead > 0) return 'LogicalDOC activity detected'
    return 'LogicalDOC change check'
  }
  if (event.action === 'reconcile') return 'Document records checked'
  if (event.action === 'ingest_failed') {
    return event.headline
      .replace(/failed to ingest/gi, 'could not be indexed')
      .replace(/failed again/gi, 'could not be indexed')
  }
  if (event.action === 'ingest_retry_pending') {
    return event.headline
      .replace(/will be retried/gi, 'will be tried again')
      .replace(/retry pending/gi, 'will be tried again')
  }
  return capitalizeHeadline(
    event.headline
      .replace(/bulk crawl/gi, 'document scan')
      .replace(/audit poll/gi, 'LogicalDOC check'),
  )
}

function userFriendlySystemDetail(event: SystemActivityEvent): string | undefined {
  const detail = event.detail?.trim()
  if (!detail) return undefined
  if (detail.includes('VITE_ADMIN_MOCK')) {
    return 'This dashboard is using sample data, so no backend services are required.'
  }
  const metrics = parseAuditPollMetrics(event)
  if (metrics) {
    return formatAuditPollDetail(
      metrics.eventsRead,
      metrics.skipped,
      metrics.queued,
      metrics.deletes,
    )
  }
  return detail
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
      action: 'bulk_running',
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
      action: 'bulk_failed',
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
      action: 'bulk_completed',
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
    kind: systemActivityKind(event),
    headline: userFriendlySystemHeadline(event),
    detail: userFriendlySystemDetail(event),
  }))

  return [...buildFolderActivityEvents(documents), ...fromSystem]
    .map((entry) => ({ ...entry, headline: capitalizeHeadline(entry.headline) }))
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
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
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
