/**
 * Seed data for the admin dashboard mock backend (`VITE_ADMIN_MOCK=true`,
 * see `src/mocks/adminMockApi.ts`). Lets you design/demo the ingestion
 * dashboard UI with zero backend (no Postgres, no LogicalDOC, no RAG
 * Engine) — just `npm run dev`.
 *
 * Deliberately a *separate* module from `src/test/adminFixtures.ts`: those
 * fixtures are minimal, static, and tuned for unit-test assertions. These
 * are richer and get mutated at runtime by adminMockApi's simulation so
 * clicking "Start ingesting" / "Retry" / "Pause" in the browser actually
 * changes what you see, the way a real backend would.
 */
import type {
  AdminDocumentDetail,
  AdminHealthStatus,
  BulkProgressSnapshot,
  IngestionActivityItem,
  IngestionSyncSettings,
} from '../api/types/admin'

export interface MockCounts {
  discovered: number
  staged: number
  preparing: number
  indexing: number
  ready: number
  failed: number
  deleted: number
}

export interface MockControlState {
  discoveryPaused: boolean
  discoveryPauseReason: string | null
  ingestionPaused: boolean
  ingestionPauseReason: string | null
  circuitOpen: boolean
}

const now = () => new Date().toISOString()
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

export const MOCK_SAMPLE_FILENAMES = [
  'Faculty_Handbook_2026.pdf',
  'Research_Ethics_Policy.docx',
  'Q3_Enrollment_Report.xlsx',
  'Campus_Safety_Guidelines.pdf',
  'Health_Sciences_Curriculum.pdf',
  'Library_Access_Policy.docx',
  'Graduate_Admissions_Checklist.pdf',
  'IT_Acceptable_Use_Policy.pdf',
  'Financial_Aid_Overview_2026.pdf',
  'Course_Catalog_Fall2026.pdf',
  'Student_Conduct_Code.docx',
  'Lab_Safety_Manual.pdf',
] as const

const CATEGORIES = [
  'Faculty of Health Sciences',
  'Student Affairs',
  'Registrar',
  'Information Technology',
  null,
] as const

export const ERROR_PRESETS = [
  {
    code: 'LOGICALDOC_TIMEOUT',
    message: 'LogicalDOC did not finish sending the file within 30 seconds. Retry the document.',
  },
  {
    code: 'CHECKSUM_MISMATCH',
    message: 'The file changed while it was being downloaded. Retry to fetch the latest version.',
  },
  {
    code: 'RAG_REJECTED',
    message: 'The .tmp file type is not supported. Upload a supported document format.',
  },
] as const

function buildDoc(overrides: Partial<AdminDocumentDetail>): AdminDocumentDetail {
  const base: AdminDocumentDetail = {
    source_document_id: '0',
    filename: 'Untitled.pdf',
    lifecycle_status: 'READY',
    db_status: 'READY',
    discovery_source: 'bfs',
    rag_document_id: null,
    classification_category: null,
    checksum: null,
    retry_count: 0,
    last_error: null,
    last_error_code: null,
    temporal_workflow_id: null,
    discovered_at: null,
    submitted_at: null,
    ready_at: null,
    failed_at: null,
    updated_at: now(),
    file_path: '/Default/documents',
    source_folder_id: 4951,
    source_folder_name: 'documents',
    source_file_version: '1.0',
    audit_history_id: null,
    processing_stage: null,
    minio_staged: false,
    queued_at: null,
    last_success_at: null,
    last_failure_at: null,
  }
  return { ...base, ...overrides }
}

/** A handful of READY docs — the bulk of a healthy corpus. */
function readyDocs(): AdminDocumentDetail[] {
  return MOCK_SAMPLE_FILENAMES.slice(0, 8).map((filename, i) =>
    buildDoc({
      source_document_id: String(4900 + i),
      filename,
      lifecycle_status: 'READY',
      db_status: 'READY',
      classification_category: CATEGORIES[i % CATEGORIES.length],
      checksum: `sha1:${(1000 + i).toString(16)}abc`,
      rag_document_id: `rag-${4900 + i}`,
      discovered_at: daysAgo(6 - i * 0.3),
      submitted_at: daysAgo(6 - i * 0.3),
      ready_at: daysAgo(5.9 - i * 0.3),
      updated_at: daysAgo(5.9 - i * 0.3),
      last_success_at: daysAgo(5.9 - i * 0.3),
    }),
  )
}

/** A few FAILED docs with distinct, debuggable errors. */
function failedDocs(): AdminDocumentDetail[] {
  return [
    buildDoc({
      source_document_id: '4801',
      filename: 'Payroll_Export_June.xlsx',
      lifecycle_status: 'FAILED',
      db_status: 'FAILED',
      retry_count: 2,
      last_error: ERROR_PRESETS[0].message,
      last_error_code: ERROR_PRESETS[0].code,
      discovered_at: hoursAgo(5),
      submitted_at: hoursAgo(5),
      failed_at: hoursAgo(4.5),
      updated_at: hoursAgo(4.5),
      last_failure_at: hoursAgo(4.5),
    }),
    buildDoc({
      source_document_id: '4802',
      filename: 'Alumni_Directory_Draft.docx',
      lifecycle_status: 'FAILED',
      db_status: 'FAILED',
      retry_count: 1,
      last_error: ERROR_PRESETS[1].message,
      last_error_code: ERROR_PRESETS[1].code,
      discovered_at: hoursAgo(3),
      submitted_at: hoursAgo(3),
      failed_at: hoursAgo(2.7),
      updated_at: hoursAgo(2.7),
      last_failure_at: hoursAgo(2.7),
    }),
    buildDoc({
      source_document_id: '4803',
      filename: 'scan_00214.tmp',
      lifecycle_status: 'FAILED',
      db_status: 'FAILED',
      retry_count: 0,
      last_error: ERROR_PRESETS[2].message,
      last_error_code: ERROR_PRESETS[2].code,
      discovered_at: minutesAgo(40),
      submitted_at: minutesAgo(38),
      failed_at: minutesAgo(37),
      updated_at: minutesAgo(37),
      last_failure_at: minutesAgo(37),
    }),
  ]
}

/** Docs mid-pipeline — makes the waterfall component show every stage. */
function inFlightDocs(): AdminDocumentDetail[] {
  return [
    buildDoc({
      // P1-2 (UI polish pass): must not collide with `readyDocs()`'s own
      // `4900 + i` range (4900-4907 for 8 sample filenames) — a shared id
      // renders as two rows with the same React `key` (Documents/Activity
      // tables key off `source_document_id`), which React warns about and
      // can duplicate/drop either row.
      source_document_id: '4911',
      filename: 'New_Hire_Onboarding_Guide.pdf',
      lifecycle_status: 'INDEXING',
      db_status: 'INDEXING',
      processing_stage: 'lexical_indexed',
      discovered_at: minutesAgo(6),
      submitted_at: minutesAgo(4),
      updated_at: minutesAgo(1),
      queued_at: minutesAgo(5),
    }),
    buildDoc({
      source_document_id: '4912',
      filename: 'Campus_Map_2026.pdf',
      lifecycle_status: 'DISCOVERED',
      db_status: 'PENDING',
      discovery_source: 'audit',
      discovered_at: minutesAgo(2),
      updated_at: minutesAgo(2),
    }),
  ]
}

export function buildInitialDocuments(): AdminDocumentDetail[] {
  return [...readyDocs(), ...failedDocs(), ...inFlightDocs()]
}

export function buildInitialCounts(): MockCounts {
  return {
    discovered: 0,
    staged: 0,
    preparing: 0,
    indexing: 1,
    ready: 3128,
    failed: 3,
    deleted: 4,
  }
}

export function buildInitialControl(): MockControlState {
  return {
    discoveryPaused: false,
    discoveryPauseReason: null,
    ingestionPaused: false,
    ingestionPauseReason: null,
    circuitOpen: false,
  }
}

export function buildInitialSync(): IngestionSyncSettings {
  return {
    audit_sync_enabled: true,
    audit_sync_env_default: true,
    audit_sync_runtime_override: null,
    audit_poll_interval_seconds: 60,
    reconciliation_interval_hours: 168,
    reconciliation_env_hours: 168,
    reconciliation_runtime_override: null,
    background_loop_active: true,
  }
}

export function buildInitialHealth(): AdminHealthStatus {
  return {
    adapter: 'ok',
    logicaldoc: 'ok',
    rag_engine: 'ok',
    minio: 'ok',
    mq_consumer_configured: true,
    temporal_enabled: false,
    endpoints: {
      adapter: 'http://localhost:8001',
      logicaldoc: 'http://localhost:8082',
      rag_engine: 'http://rag.dev.localtest.me:8080',
      minio: 'http://localhost:9000',
      rabbitmq: '127.0.0.1:5672',
      temporal: null,
    },
  }
}

export function buildInitialBulk(): BulkProgressSnapshot {
  return {
    job_state: 'idle',
    traversal_status: 'idle',
    total_known: null,
    total_discovered: 0,
    total_preparing: 0,
    total_staged_for_rag: 0,
    total_submitted: 0,
    total_fully_indexed: 0,
    total_failed: 0,
    current_inflight: 0,
    target_inflight: 80,
    preparing_capacity: 2000,
    preparing_resume_threshold: 1000,
    staged_capacity: 1000,
    staged_resume_threshold: 500,
    current_folder_id: null,
    current_page: null,
    discovery_backpressured: false,
    preparation_backpressured: false,
    submission_backpressured: false,
    documents_per_second: null,
    estimated_seconds_remaining: null,
  }
}

let activitySeq = 0
export function makeActivityItem(
  level: IngestionActivityItem['level'],
  category: string,
  action: string,
  headline: string,
  detail?: string | null,
): IngestionActivityItem {
  activitySeq += 1
  return {
    id: `mock-activity-${activitySeq}`,
    at: now(),
    level,
    category,
    action,
    headline,
    detail: detail ?? undefined,
  }
}

export function buildInitialActivity(): IngestionActivityItem[] {
  activitySeq = 0
  return [
    makeActivityItem(
      'info',
      'system',
      'mock_mode',
      'Sample data is active',
      'This dashboard is using sample data, so no backend services are required.',
    ),
    makeActivityItem(
      'error',
      'pipeline',
      'ingest_failed',
      'scan_00214.tmp failed to ingest',
      ERROR_PRESETS[2].message,
    ),
    makeActivityItem(
      'error',
      'pipeline',
      'ingest_failed',
      'Alumni_Directory_Draft.docx failed to ingest',
      ERROR_PRESETS[1].message,
    ),
    makeActivityItem(
      'warning',
      'audit',
      'audit_poll',
      'LogicalDOC changes checked',
      'Checked 2 changes; neither required an update.',
    ),
    makeActivityItem(
      'success',
      'operator',
      'bulk_start',
      'Initial bulk crawl completed',
      '3,131 document(s) discovered, 3,128 indexed',
    ),
  ]
}
