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
      `${label} — ${LIFECYCLE_LABELS[status]}`,
      levelForStatus(status),
      LIFECYCLE_HINTS[status],
    )
  }

  return events
}

export function mergeActivityFeed(
  documents: AdminDocumentSummary[],
  limit = 60,
): ActivityEntry[] {
  return documents
    .flatMap(buildDocumentActivityEvents)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
}
