/**
 * In-memory mock implementation of every function in `src/api/admin.ts`,
 * used when `VITE_ADMIN_MOCK=true` (see `config/admin.ts`). Lets the admin
 * dashboard be built/reviewed with zero backend — no Postgres, LogicalDOC,
 * or RAG Engine required.
 *
 * Mutations (pause/resume/retry/start) actually change the in-memory
 * store and a lightweight interval simulates a bulk crawl moving documents
 * through the pipeline stages, so the UI's polling (React Query
 * `refetchInterval`) picks up believable, live-looking progress the same
 * way it would against the real adapter.
 */
import { ApiError } from '../api/http'
import type {
  AdminChatSessionResponse,
  AdminDocumentDetail,
  AdminDocumentListResponse,
  AdminDocumentQuery,
  AdminResumeAllResponse,
  IncrementalSyncResult,
  IngestionActivityResponse,
  IngestionControlState,
  IngestionErrorGroup,
  IngestionErrorsResponse,
  IngestionOverview,
  OverallState,
  ReconciliationResult,
  ReingestMissingClassificationResponse,
  RetryResponse,
  RunState,
} from '../api/types/admin'
import {
  buildInitialActivity,
  buildInitialBulk,
  buildInitialControl,
  buildInitialCounts,
  buildInitialDocuments,
  buildInitialHealth,
  buildInitialSync,
  ERROR_PRESETS,
  makeActivityItem,
  MOCK_SAMPLE_FILENAMES,
  type MockControlState,
  type MockCounts,
} from './adminMockData'
import type {
  AdminHealthStatus,
  BulkProgressSnapshot,
  IngestionActivityItem,
  IngestionSyncSettings,
} from '../api/types/admin'

interface Store {
  documents: AdminDocumentDetail[]
  counts: MockCounts
  control: MockControlState
  sync: IngestionSyncSettings
  health: AdminHealthStatus
  bulk: BulkProgressSnapshot
  activity: IngestionActivityItem[]
  lastAuditPollAt: string | null
  lastHistoryId: number | null
  lastHistoryAt: string | null
  lastReconciliationAt: string | null
  nextDocSeq: number
  /** New docs discovered so far *this* simulated run — resets each Start. */
  simRunDiscovered: number
}

const SIM_TICK_MS = 900
/** How many "new" documents a single simulated bulk run discovers before
 * it reports completed — kept small so a demo run finishes in ~20-30s. */
const SIM_RUN_TARGET = 22
const ACTIVITY_CAP = 200

let store: Store | null = null
let simTimer: ReturnType<typeof setInterval> | null = null

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickErrorPreset() {
  return ERROR_PRESETS[randInt(0, ERROR_PRESETS.length - 1)]
}

function freshStore(): Store {
  return {
    documents: buildInitialDocuments(),
    counts: buildInitialCounts(),
    control: buildInitialControl(),
    sync: buildInitialSync(),
    health: buildInitialHealth(),
    bulk: buildInitialBulk(),
    activity: buildInitialActivity(),
    lastAuditPollAt: new Date(Date.now() - 45_000).toISOString(),
    lastHistoryId: 5104,
    lastHistoryAt: new Date(Date.now() - 45_000).toISOString(),
    lastReconciliationAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
    nextDocSeq: 5000,
    simRunDiscovered: 0,
  }
}

function getStore(): Store {
  if (!store) store = freshStore()
  return store
}

function addActivity(item: IngestionActivityItem): void {
  const s = getStore()
  s.activity.unshift(item)
  if (s.activity.length > ACTIVITY_CAP) s.activity.length = ACTIVITY_CAP
}

function overallState(control: MockControlState): OverallState {
  if (control.circuitOpen) return 'DEGRADED'
  if (control.discoveryPaused && control.ingestionPaused) return 'PAUSED'
  if (control.discoveryPaused || control.ingestionPaused) return 'PARTIAL'
  return 'RUNNING'
}

function runState(paused: boolean): RunState {
  return paused ? 'PAUSED' : 'RUNNING'
}

function buildOverview(): IngestionOverview {
  const s = getStore()
  return {
    overall_state: overallState(s.control),
    discovery_state: runState(s.control.discoveryPaused),
    ingestion_state: runState(s.control.ingestionPaused),
    discovery_pause_reason: s.control.discoveryPauseReason,
    ingestion_pause_reason: s.control.ingestionPauseReason,
    temporal_enabled: false,
    circuit_open: s.control.circuitOpen,
    counts: { ...s.counts },
    last_audit_poll_at: s.lastAuditPollAt,
    last_history_id: s.lastHistoryId,
    last_history_at: s.lastHistoryAt,
    audit_sync_enabled: s.sync.audit_sync_enabled,
    last_reconciliation_at: s.lastReconciliationAt,
    sync: { ...s.sync },
    rag_api_base_url: s.health.endpoints?.rag_engine ?? 'http://rag.dev.localtest.me:8080',
    health: { ...s.health },
    bulk_progress: { ...s.bulk },
  }
}

function buildControlResponse(): IngestionControlState {
  const s = getStore()
  return {
    discovery_paused: s.control.discoveryPaused,
    discovery_pause_reason: s.control.discoveryPauseReason,
    ingestion_paused: s.control.ingestionPaused,
    ingestion_pause_reason: s.control.ingestionPauseReason,
    temporal_enabled: false,
    circuit_open: s.control.circuitOpen,
  }
}

function materializeFailedDoc(): AdminDocumentDetail {
  const s = getStore()
  const preset = pickErrorPreset()
  const filename = `${MOCK_SAMPLE_FILENAMES[randInt(0, MOCK_SAMPLE_FILENAMES.length - 1)]}`
  const id = String(s.nextDocSeq++)
  const doc: AdminDocumentDetail = {
    source_document_id: id,
    filename: `${filename.replace(/\.[a-z0-9]+$/i, '')}_${id}${filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '.pdf'}`,
    lifecycle_status: 'FAILED',
    db_status: 'FAILED',
    discovery_source: 'bfs',
    rag_document_id: null,
    classification_category: null,
    checksum: null,
    retry_count: 0,
    last_error: preset.message,
    last_error_code: preset.code,
    temporal_workflow_id: null,
    discovered_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    ready_at: null,
    failed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    file_path: '/Default/documents',
    source_folder_id: 4951,
    source_folder_name: 'documents',
    source_file_version: '1.0',
    audit_history_id: null,
    processing_stage: null,
    minio_staged: false,
    queued_at: new Date().toISOString(),
    last_success_at: null,
    last_failure_at: new Date().toISOString(),
  }
  s.documents.unshift(doc)
  return doc
}

function stopSim(): void {
  if (simTimer != null) {
    clearInterval(simTimer)
    simTimer = null
  }
}

function simTick(): void {
  const s = getStore()
  const b = s.bulk
  if (b.job_state !== 'running') {
    stopSim()
    return
  }

  // Discover new docs — respects the discovery gate.
  if (!s.control.discoveryPaused && s.simRunDiscovered < SIM_RUN_TARGET) {
    const n = Math.min(randInt(1, 3), SIM_RUN_TARGET - s.simRunDiscovered)
    s.counts.discovered += n
    s.simRunDiscovered += n
    b.total_discovered += n
  }

  const advance = (from: keyof MockCounts, to: keyof MockCounts, max: number): number => {
    const n = Math.min(s.counts[from], randInt(0, max))
    if (n <= 0) return 0
    s.counts[from] -= n
    s.counts[to] += n
    return n
  }

  advance('discovered', 'preparing', 3)
  advance('preparing', 'staged', 3)

  if (!s.control.ingestionPaused) {
    const submitted = advance('staged', 'indexing', 3)
    b.total_submitted += submitted
  }

  // Already-indexing docs keep completing even while ingestion is paused
  // ("in flight indexing continues" — matches the real pause semantics).
  const settled = Math.min(s.counts.indexing, randInt(0, 2))
  let readyNow = 0
  let failedNow = 0
  for (let i = 0; i < settled; i++) {
    if (Math.random() < 0.08) failedNow += 1
    else readyNow += 1
  }
  if (settled > 0) {
    s.counts.indexing -= settled
    s.counts.ready += readyNow
    s.counts.failed += failedNow
    b.total_fully_indexed += readyNow
    b.total_failed += failedNow
  }
  for (let i = 0; i < failedNow; i++) {
    const doc = materializeFailedDoc()
    addActivity(
      makeActivityItem(
        'error',
        'pipeline',
        'ingest_failed',
        `${doc.filename} failed to ingest`,
        doc.last_error,
      ),
    )
  }

  b.total_preparing = s.counts.preparing
  b.total_staged_for_rag = s.counts.staged
  b.current_inflight = s.counts.indexing
  b.current_folder_id = 4951
  b.current_page = Math.floor(s.simRunDiscovered / 5)
  b.discovery_backpressured =
    s.counts.preparing >= (b.preparing_capacity ?? Number.POSITIVE_INFINITY)
  b.preparation_backpressured =
    s.counts.staged >= (b.staged_capacity ?? Number.POSITIVE_INFINITY)
  b.submission_backpressured =
    s.counts.indexing >= (b.target_inflight ?? Number.POSITIVE_INFINITY)
  b.total_known = null

  const stillMoving =
    s.counts.discovered + s.counts.preparing + s.counts.staged + s.counts.indexing > 0
  const stillDiscovering = s.simRunDiscovered < SIM_RUN_TARGET

  if (readyNow > 0 || settled > 0) {
    b.documents_per_second = Math.max(readyNow, 0.1) / (SIM_TICK_MS / 1000)
    const remaining =
      s.counts.discovered +
      s.counts.preparing +
      s.counts.staged +
      s.counts.indexing +
      Math.max(SIM_RUN_TARGET - s.simRunDiscovered, 0)
    b.estimated_seconds_remaining = b.documents_per_second
      ? remaining / b.documents_per_second
      : null
  }

  if (!stillDiscovering && !stillMoving) {
    b.job_state = 'completed'
    b.traversal_status = 'completed'
    b.discovery_backpressured = false
    b.preparation_backpressured = false
    b.submission_backpressured = false
    b.documents_per_second = null
    b.estimated_seconds_remaining = null
    addActivity(
      makeActivityItem(
        'success',
        'operator',
        'bulk_start',
        'Document scan complete',
        `${b.total_discovered} discovered this run, ${b.total_fully_indexed} indexed, ${b.total_failed} failed.`,
      ),
    )
    stopSim()
  }
}

function ensureSimRunning(): void {
  if (simTimer != null) return
  simTimer = setInterval(simTick, SIM_TICK_MS)
}

function startBulkRun(): void {
  const s = getStore()
  s.simRunDiscovered = 0
  s.bulk = {
    ...s.bulk,
    job_state: 'running',
    traversal_status: 'running',
    total_known: null,
    total_discovered: 0,
    total_preparing: 0,
    total_staged_for_rag: 0,
    total_submitted: 0,
    total_fully_indexed: 0,
    total_failed: 0,
    current_inflight: 0,
    current_folder_id: 4951,
    current_page: 0,
    discovery_backpressured: false,
    preparation_backpressured: false,
    submission_backpressured: false,
    documents_per_second: null,
    estimated_seconds_remaining: null,
    job_error: null,
  }
  ensureSimRunning()
}

// ---------------------------------------------------------------------------
// Public mock API — one function per src/api/admin.ts export, same shape.
// ---------------------------------------------------------------------------

export async function mockFetchIngestionOverview(): Promise<IngestionOverview> {
  return buildOverview()
}

export async function mockFetchIngestionActivity(): Promise<IngestionActivityResponse> {
  const s = getStore()
  return { items: s.activity.slice(0, 80) }
}

export async function mockPauseIngestion(): Promise<IngestionControlState> {
  const s = getStore()
  s.control.ingestionPaused = true
  s.control.ingestionPauseReason = 'manual'
  addActivity(makeActivityItem('warning', 'operator', 'pause_ingestion', 'Ingestion paused'))
  return buildControlResponse()
}

export async function mockResumeIngestion(): Promise<IngestionControlState> {
  const s = getStore()
  s.control.ingestionPaused = false
  s.control.ingestionPauseReason = null
  addActivity(makeActivityItem('success', 'operator', 'resume_ingestion', 'Ingestion resumed'))
  return buildControlResponse()
}

export async function mockPauseDiscovery(): Promise<IngestionControlState> {
  const s = getStore()
  s.control.discoveryPaused = true
  s.control.discoveryPauseReason = 'manual'
  addActivity(makeActivityItem('warning', 'operator', 'pause_discovery', 'Discovery paused'))
  return buildControlResponse()
}

export async function mockResumeDiscovery(): Promise<IngestionControlState> {
  const s = getStore()
  s.control.discoveryPaused = false
  s.control.discoveryPauseReason = null
  addActivity(makeActivityItem('success', 'operator', 'resume_discovery', 'Discovery resumed'))
  return buildControlResponse()
}

function matchesQuery(doc: AdminDocumentDetail, params: AdminDocumentQuery): boolean {
  if (params.docId && !doc.source_document_id.toLowerCase().includes(params.docId.toLowerCase())) {
    return false
  }
  if (params.filename && !(doc.filename ?? '').toLowerCase().includes(params.filename.toLowerCase())) {
    return false
  }
  if (params.status && doc.db_status !== params.status.toUpperCase()) return false
  if (params.lifecycleStatus && doc.lifecycle_status !== params.lifecycleStatus) return false
  if (params.discoverySource && doc.discovery_source !== params.discoverySource) return false
  return true
}

export async function mockFetchAdminDocuments(
  params: AdminDocumentQuery,
): Promise<AdminDocumentListResponse> {
  const s = getStore()
  const offset = params.offset ?? 0
  const limit = params.limit ?? 50
  const filtered = s.documents.filter((doc) => matchesQuery(doc, params))
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    offset,
    limit,
  }
}

export async function mockFetchAdminDocument(docId: string): Promise<AdminDocumentDetail> {
  const s = getStore()
  const doc = s.documents.find((d) => d.source_document_id === docId)
  if (!doc) throw new ApiError('Document not found', 404, 'Document not found')
  return doc
}

export async function mockFetchIngestionErrors(): Promise<IngestionErrorsResponse> {
  const s = getStore()
  const groups = new Map<string, number>()
  for (const doc of s.documents) {
    if (doc.lifecycle_status !== 'FAILED') continue
    const key = doc.last_error_code ?? 'unknown'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const items: IngestionErrorGroup[] = Array.from(groups.entries())
    .map(([error_code, count]) => ({ error_code, count }))
    .sort((a, b) => b.count - a.count)
  return { groups: items }
}

export async function mockRetryDocument(docId: string): Promise<RetryResponse> {
  const s = getStore()
  const doc = s.documents.find((d) => d.source_document_id === docId)
  if (!doc) throw new ApiError('Document not found', 404, 'Document not found')
  if (doc.lifecycle_status !== 'FAILED') return { retried: 0 }

  s.counts.failed = Math.max(0, s.counts.failed - 1)
  s.counts.indexing += 1
  doc.retry_count += 1
  doc.lifecycle_status = 'INDEXING'
  doc.db_status = 'INDEXING'
  doc.last_error = null
  doc.last_error_code = null
  doc.updated_at = new Date().toISOString()
  addActivity(
    makeActivityItem('info', 'operator', 'retry', `Retry scheduled: ${doc.filename ?? docId}`),
  )

  setTimeout(() => {
    const stillThere = s.documents.find((d) => d.source_document_id === docId)
    if (!stillThere || stillThere.lifecycle_status !== 'INDEXING') return
    s.counts.indexing = Math.max(0, s.counts.indexing - 1)
    if (Math.random() < 0.85) {
      stillThere.lifecycle_status = 'READY'
      stillThere.db_status = 'READY'
      stillThere.ready_at = new Date().toISOString()
      stillThere.last_success_at = new Date().toISOString()
      stillThere.updated_at = new Date().toISOString()
      s.counts.ready += 1
      addActivity(
        makeActivityItem('success', 'pipeline', 'ready', `${stillThere.filename} is ready`),
      )
    } else {
      const preset = pickErrorPreset()
      stillThere.lifecycle_status = 'FAILED'
      stillThere.db_status = 'FAILED'
      stillThere.last_error = preset.message
      stillThere.last_error_code = preset.code
      stillThere.failed_at = new Date().toISOString()
      stillThere.last_failure_at = new Date().toISOString()
      stillThere.updated_at = new Date().toISOString()
      s.counts.failed += 1
      addActivity(
        makeActivityItem(
          'error',
          'pipeline',
          'ingest_failed',
          `${stillThere.filename} failed again`,
          preset.message,
        ),
      )
    }
  }, 1400)

  return { retried: 1 }
}

export async function mockRetryFailedDocuments(): Promise<RetryResponse> {
  const s = getStore()
  const failedIds = s.documents
    .filter((d) => d.lifecycle_status === 'FAILED')
    .map((d) => d.source_document_id)
  let retried = 0
  for (const id of failedIds) {
    const result = await mockRetryDocument(id)
    retried += result.retried
  }
  return { retried }
}

export async function mockResumeAllIngestion(): Promise<AdminResumeAllResponse> {
  const s = getStore()
  const discovery_resumed = s.control.discoveryPaused
  const ingestion_resumed = s.control.ingestionPaused
  if (discovery_resumed) {
    s.control.discoveryPaused = false
    s.control.discoveryPauseReason = null
  }
  if (ingestion_resumed) {
    s.control.ingestionPaused = false
    s.control.ingestionPauseReason = null
  }

  let bulk_started = false
  let catch_up_scheduled = false
  if (s.bulk.job_state !== 'running') {
    startBulkRun()
    bulk_started = true
  } else {
    catch_up_scheduled = true
  }

  const parts: string[] = []
  if (discovery_resumed) parts.push('discovery resumed')
  if (ingestion_resumed) parts.push('ingestion resumed')
  if (bulk_started) parts.push('a full document scan started')
  else if (catch_up_scheduled) parts.push('new document changes will be checked')

  addActivity(
    makeActivityItem(
      'success',
      'operator',
      'start_ingesting',
      'Ingestion started',
      parts.length ? parts.join(' · ') : 'Everything was already running.',
    ),
  )

  return { discovery_resumed, ingestion_resumed, bulk_started, catch_up_scheduled }
}

export async function mockUpdateIngestionSyncSettings(settings: {
  audit_sync_enabled?: boolean
  reconciliation_interval_hours?: number
}): Promise<IngestionOverview> {
  const s = getStore()
  if (settings.reconciliation_interval_hours != null && settings.reconciliation_interval_hours < 0) {
    throw new ApiError('reconciliation_interval_hours must be >= 0', 400, 'reconciliation_interval_hours must be >= 0')
  }
  if (settings.audit_sync_enabled !== undefined) {
    s.sync.audit_sync_runtime_override = settings.audit_sync_enabled
    s.sync.audit_sync_enabled = settings.audit_sync_enabled
  }
  if (settings.reconciliation_interval_hours !== undefined) {
    s.sync.reconciliation_runtime_override = settings.reconciliation_interval_hours
    s.sync.reconciliation_interval_hours = settings.reconciliation_interval_hours
  }
  addActivity(makeActivityItem('info', 'operator', 'sync_settings', 'Sync settings updated'))
  return buildOverview()
}

export async function mockTriggerAuditPoll(): Promise<IncrementalSyncResult> {
  const s = getStore()
  const events_read = randInt(0, 4)
  const docs_queued = randInt(0, events_read)
  const docs_skipped = events_read - docs_queued
  s.lastHistoryId = (s.lastHistoryId ?? 5000) + events_read
  s.lastHistoryAt = new Date().toISOString()
  s.lastAuditPollAt = new Date().toISOString()
  addActivity(
    makeActivityItem(
      docs_queued > 0 ? 'success' : 'info',
      'audit',
      'audit_poll',
      'LogicalDOC changes checked',
      docs_queued > 0
        ? `${docs_queued} document(s) need updating; ${docs_skipped} did not require an update.`
        : `No documents need updating. ${docs_skipped} change(s) were already up to date.`,
    ),
  )
  return {
    events_read,
    docs_queued,
    docs_skipped,
    deletes_processed: 0,
    checkpoint_history_id: s.lastHistoryId,
    checkpoint_history_at: s.lastHistoryAt,
  }
}

export async function mockTriggerReconciliation(): Promise<ReconciliationResult> {
  const s = getStore()
  const total = s.documents.length
  const missing_in_adapter = randInt(0, 2)
  const orphaned_in_adapter = randInt(0, 1)
  s.lastReconciliationAt = new Date().toISOString()
  addActivity(
    makeActivityItem(
      missing_in_adapter > 0 ? 'success' : 'info',
      'reconcile',
      'reconcile',
      'Document records checked',
      missing_in_adapter > 0 || orphaned_in_adapter > 0
        ? `${missing_in_adapter} missing document(s) queued for ingestion; ${orphaned_in_adapter} outdated record(s) found.`
        : `All ${total} document records are in sync.`,
    ),
  )
  return {
    logicaldoc_ids: total + missing_in_adapter,
    adapter_ids: total,
    missing_in_adapter,
    orphaned_in_adapter,
    queued_for_ingest: missing_in_adapter,
    deletes_processed: orphaned_in_adapter,
  }
}

export async function mockMintAdminChatSession(): Promise<AdminChatSessionResponse> {
  return {
    username: 'admin-operator (mock)',
    exchange_token: 'mock-exchange-token',
    session_url: null,
    chat_url: '/chat',
  }
}

export async function mockClassifyMissingDocuments(
  limit: number,
): Promise<ReingestMissingClassificationResponse> {
  const s = getStore()
  const candidates = s.documents.filter(
    (d) => d.lifecycle_status === 'READY' && !d.classification_category,
  )
  const targets = candidates.slice(0, limit)
  const categories = ['Faculty of Health Sciences', 'Student Affairs', 'Registrar', 'Information Technology']
  for (const doc of targets) {
    setTimeout(() => {
      doc.classification_category = categories[randInt(0, categories.length - 1)]
      doc.updated_at = new Date().toISOString()
    }, 1200)
  }
  addActivity(
    makeActivityItem(
      targets.length ? 'success' : 'info',
      'operator',
      'classify_missing',
      targets.length
        ? `Queued ${targets.length} document(s) for classification`
        : 'No documents need classification',
    ),
  )
  return { queued: targets.length, source_document_ids: targets.map((d) => d.source_document_id) }
}

export async function mockReingestMissingClassification(): Promise<ReingestMissingClassificationResponse> {
  return mockClassifyMissingDocuments(10)
}

/** Test/dev escape hatch — resets the mock store to its initial seed. */
export function resetAdminMock(): void {
  stopSim()
  store = freshStore()
}
