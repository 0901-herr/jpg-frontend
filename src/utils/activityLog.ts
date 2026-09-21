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

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
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
    const failed = docs.filter((doc) => doc.lifecycle_status === 'FAILED').length
    const inFlight = docs.filter((doc) => !isTerminalLifecycle(doc.lifecycle_status)).length
    const total = docs.length
    const done = ready + failed
    const at = latestTimestamp(docs)

    const detailParts = [
      formatCount(ready, 'ready'),
      failed > 0 ? formatCount(failed, 'failed') : null,
      inFlight > 0 ? `${inFlight.toLocaleString()} still processing` : null,
    ].filter(Boolean)

    if (inFlight === 0 && done > 0) {
      entries.push({
        id: `folder-${key}-done`,
        at,
        level: failed > 0 ? 'warning' : 'success',
        kind: failed > 0 ? 'failed' : 'completed',
        headline: `Finished ingesting “${label}”`,
        detail: detailParts.join(' · '),
      })
      continue
    }

    if (done > 0 || inFlight > 0) {
      entries.push({
        id: `folder-${key}-progress`,
        at,
        level: failed > 0 ? 'warning' : 'info',
        kind: 'processing',
        headline: `Ingesting “${label}” (${done.toLocaleString()}/${total.toLocaleString()})`,
        detail: detailParts.join(' · '),
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

function userFriendlySystemHeadline(event: SystemActivityEvent): string {
  if (event.action === 'mock_mode') return 'Sample data is active'
  if (event.action === 'audit_poll_failed') {
    return event.headline?.trim() || 'LogicalDOC change check failed'
  }
  if (event.action === 'audit_poll') {
    if (/restored/i.test(event.headline)) return 'LogicalDOC change check restored'
    return 'LogicalDOC changes checked'
  }
  if (event.action === 'reconcile') return 'Document records checked'
  if (event.action === 'ingest_failed') {
    return event.headline
      .replace(/failed to ingest/gi, 'could not be indexed')
      .replace(/failed again/gi, 'could not be indexed')
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
  const audit = detail.match(/events_read=(\d+),\s*skipped=(\d+)/i)
  if (audit) {
    return `Checked ${audit[1]} change(s); ${audit[2]} did not require an update.`
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
