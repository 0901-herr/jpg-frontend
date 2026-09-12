import type {
  AdminDocumentListResponse,
  AdminDocumentSummary,
  IngestionControlState,
  IngestionOverview,
  ReingestMissingResponse,
  RetryResponse,
} from '../api/types/admin'

export const mockOverviewRunning: IngestionOverview = {
  overall_state: 'RUNNING',
  discovery_state: 'RUNNING',
  ingestion_state: 'RUNNING',
  discovery_pause_reason: null,
  ingestion_pause_reason: null,
  temporal_enabled: true,
  circuit_open: false,
  counts: {
    discovered: 100,
    staged: 20,
    preparing: 10,
    indexing: 5,
    ready: 310000,
    failed: 420,
    deleted: 3,
  },
  last_audit_poll_at: new Date(Date.now() - 15_000).toISOString(),
  last_history_id: 5152,
  last_history_at: new Date().toISOString(),
  audit_sync_enabled: true,
  last_reconciliation_at: '2026-09-06T02:00:00Z',
  rag_api_base_url: 'http://rag.example:8080',
  health: {
    adapter: 'ok',
    logicaldoc: 'ok',
    rag_engine: 'ok',
    minio: 'ok',
    mq_consumer_configured: true,
    temporal_enabled: true,
    endpoints: {
      adapter: 'http://localhost:8001',
      logicaldoc: 'http://localhost:8082',
      rag_engine: 'http://rag.example:8080',
      minio: 'http://localhost:9000',
      rabbitmq: '127.0.0.1:5672',
      temporal: 'localhost:7233',
    },
  },
  bulk_progress: {
    job_state: 'running',
    traversal_status: 'running',
    total_known: null,
    total_discovered: 342000,
    total_preparing: 10,
    total_staged_for_rag: 20,
    total_submitted: 100,
    total_fully_indexed: 310000,
    total_failed: 420,
    documents_per_second: 2.5,
    estimated_seconds_remaining: 12800,
  },
}

export const mockOverviewPaused: IngestionOverview = {
  ...mockOverviewRunning,
  overall_state: 'PAUSED',
  discovery_state: 'PAUSED',
  ingestion_state: 'PAUSED',
  discovery_pause_reason: 'manual',
  ingestion_pause_reason: 'manual',
}

export const mockOverviewDegraded: IngestionOverview = {
  ...mockOverviewRunning,
  overall_state: 'DEGRADED',
  circuit_open: true,
  health: {
    ...mockOverviewRunning.health,
    rag_engine: 'unavailable',
  },
}

export function mockDocument(
  overrides: Partial<AdminDocumentSummary> = {},
): AdminDocumentSummary {
  return {
    source_document_id: '5052',
    filename: 'CT_Report.pdf',
    lifecycle_status: 'READY',
    db_status: 'READY',
    discovery_source: 'bfs',
    rag_document_id: 'abc123-uuid',
    classification_category: null,
    checksum: 'sha256:abc',
    retry_count: 1,
    last_error: null,
    last_error_code: null,
    temporal_workflow_id: 'adapter-ingest-5052',
    discovered_at: '2026-09-06T16:42:10Z',
    submitted_at: '2026-09-06T16:42:21Z',
    ready_at: '2026-09-06T16:44:03Z',
    failed_at: null,
    updated_at: '2026-09-06T16:44:03Z',
    ...overrides,
  }
}

export function mockDocumentList(
  items: AdminDocumentSummary[],
  total?: number,
): AdminDocumentListResponse {
  return { items, total: total ?? items.length, offset: 0, limit: 50 }
}

export const mockControlRunning: IngestionControlState = {
  discovery_paused: false,
  discovery_pause_reason: null,
  ingestion_paused: false,
  ingestion_pause_reason: null,
  temporal_enabled: true,
  circuit_open: false,
}

export const mockControlPaused: IngestionControlState = {
  ...mockControlRunning,
  ingestion_paused: true,
  ingestion_pause_reason: 'manual',
}

export const mockRetryResponse: RetryResponse = { retried: 1 }

export const mockReingestMissingResponse: ReingestMissingResponse = {
  queued: 2,
  source_document_ids: ['101', '102'],
}
