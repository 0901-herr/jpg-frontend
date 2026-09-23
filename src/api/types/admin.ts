export type OverallState = 'RUNNING' | 'PAUSED' | 'PARTIAL' | 'DEGRADED' | 'ERROR'
export type RunState = 'RUNNING' | 'PAUSED' | 'COMPLETE' | 'idle'

export type LifecycleStatus =
  | 'DISCOVERED'
  | 'QUEUED'
  | 'PREPARING'
  | 'STAGED'
  | 'SUBMITTED'
  | 'INDEXING'
  | 'PARTIAL'
  | 'READY'
  | 'RETRYING'
  | 'FAILED'
  | 'UNSUPPORTED'
  | 'DELETING'
  | 'DELETED'

export interface AdminHealthEndpoints {
  adapter: string
  logicaldoc: string
  rag_engine: string
  minio: string | null
  rabbitmq: string | null
  temporal: string | null
}

export interface AdminHealthStatus {
  adapter: string
  logicaldoc: string
  rag_engine: string
  minio: string
  mq_consumer_configured: boolean
  temporal_enabled: boolean
  endpoints?: AdminHealthEndpoints | null
}

export interface BulkProgressSnapshot {
  job_state: string
  traversal_status: string
  total_known: number | null
  total_discovered: number
  total_preparing: number
  total_staged_for_rag: number
  total_submitted: number
  total_fully_indexed: number
  total_failed: number
  current_inflight?: number
  target_inflight?: number
  preparing_capacity?: number
  preparing_resume_threshold?: number
  staged_capacity?: number
  staged_resume_threshold?: number
  current_folder_id?: number | null
  current_page?: number | null
  discovery_backpressured?: boolean
  preparation_backpressured?: boolean | null
  submission_backpressured?: boolean | null
  documents_per_second: number | null
  estimated_seconds_remaining: number | null
  job_error?: string | null
}

export interface IngestionSyncSettings {
  audit_sync_enabled: boolean
  audit_sync_env_default: boolean
  audit_sync_runtime_override: boolean | null
  audit_poll_interval_seconds: number
  reconciliation_interval_hours: number
  reconciliation_env_hours: number
  reconciliation_runtime_override: number | null
  background_loop_active: boolean
}

export interface IncrementalSyncResult {
  events_read: number
  docs_queued: number
  docs_skipped: number
  deletes_processed: number
  checkpoint_history_id: number | null
  checkpoint_history_at: string | null
}

export interface ReconciliationResult {
  logicaldoc_ids: number
  adapter_ids: number
  missing_in_adapter: number
  orphaned_in_adapter: number
  queued_for_ingest: number
  deletes_processed: number
}

export interface IngestionOverview {
  overall_state: OverallState
  discovery_state: RunState
  ingestion_state: RunState
  discovery_pause_reason: string | null
  ingestion_pause_reason: string | null
  temporal_enabled: boolean
  circuit_open: boolean
  counts: {
    discovered: number
    staged: number
    preparing: number
    indexing: number
    retrying: number
    ready: number
    partial: number
    failed: number
    deleted: number
  }
  last_audit_poll_at: string | null
  last_history_id: number | null
  last_history_at: string | null
  audit_sync_enabled: boolean
  last_reconciliation_at: string | null
  sync: IngestionSyncSettings
  rag_api_base_url: string
  health: AdminHealthStatus
  bulk_progress: BulkProgressSnapshot | null
}

export interface IngestionControlState {
  discovery_paused: boolean
  discovery_pause_reason: string | null
  ingestion_paused: boolean
  ingestion_pause_reason: string | null
  temporal_enabled: boolean
  circuit_open: boolean
}

export interface AdminDocumentSummary {
  source_document_id: string
  filename: string | null
  lifecycle_status: LifecycleStatus
  db_status: string
  discovery_source: string | null
  rag_document_id: string | null
  classification_category: string | null
  checksum: string | null
  retry_count: number
  last_error: string | null
  last_error_code: string | null
  temporal_workflow_id: string | null
  file_path: string | null
  source_folder_id: number | null
  source_folder_name: string | null
  discovered_at: string | null
  submitted_at: string | null
  ready_at: string | null
  failed_at: string | null
  updated_at: string | null
}

export interface AdminDocumentDetail extends AdminDocumentSummary {
  source_file_version: string | null
  audit_history_id: number | null
  processing_stage: string | null
  minio_staged: boolean
  queued_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
}

export interface AdminDocumentListResponse {
  items: AdminDocumentSummary[]
  total: number
  offset: number
  limit: number
}

export interface IngestionErrorGroup {
  error_code: string | null
  count: number
}

export interface IngestionErrorsResponse {
  groups: IngestionErrorGroup[]
}

export interface RetryResponse {
  retried: number
}

export interface AdminResumeAllResponse {
  discovery_resumed: boolean
  ingestion_resumed: boolean
  bulk_started: boolean
  catch_up_scheduled?: boolean
}

export interface IngestionActivityItem {
  id: string
  at: string
  level: 'info' | 'success' | 'warning' | 'error'
  category: string
  action: string
  headline: string
  detail?: string | null
}

export interface IngestionActivityResponse {
  items: IngestionActivityItem[]
}

export interface AdminBulkStartResponse {
  bulk_started: boolean
}

export interface AdminChatSessionResponse {
  username: string
  exchange_token: string
  session_url: string | null
  chat_url: string | null
}

export interface ReingestMissingClassificationResponse {
  queued: number
  source_document_ids: string[]
}

export interface AdminDocumentQuery {
  docId?: string
  filename?: string
  status?: string
  lifecycleStatus?: LifecycleStatus
  discoverySource?: string
  offset?: number
  limit?: number
}
