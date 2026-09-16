import { adminGet, adminPatch, adminPost } from './adminHttp'
import { ADMIN_MOCK } from '../config/admin'
import {
  mockClassifyMissingDocuments,
  mockFetchAdminDocument,
  mockFetchAdminDocuments,
  mockFetchIngestionActivity,
  mockFetchIngestionErrors,
  mockFetchIngestionOverview,
  mockMintAdminChatSession,
  mockPauseDiscovery,
  mockPauseIngestion,
  mockResumeAllIngestion,
  mockResumeDiscovery,
  mockResumeIngestion,
  mockRetryDocument,
  mockRetryFailedDocuments,
  mockTriggerAuditPoll,
  mockTriggerReconciliation,
  mockUpdateIngestionSyncSettings,
} from '../mocks/adminMockApi'
import type {
  AdminChatSessionResponse,
  AdminDocumentDetail,
  AdminDocumentListResponse,
  AdminDocumentQuery,
  AdminResumeAllResponse,
  IncrementalSyncResult,
  IngestionActivityResponse,
  IngestionControlState,
  IngestionErrorsResponse,
  IngestionOverview,
  ReconciliationResult,
  ReingestMissingClassificationResponse,
  RetryResponse,
} from './types/admin'

/**
 * Every export below checks `ADMIN_MOCK` first and, if set, delegates to
 * the in-memory mock backend instead of calling `fetch`. See
 * `src/mocks/adminMockApi.ts` and `.env`'s `VITE_ADMIN_MOCK`.
 */

function buildQuery(params: AdminDocumentQuery): string {
  const search = new URLSearchParams()
  if (params.docId) search.set('docId', params.docId)
  if (params.filename) search.set('filename', params.filename)
  if (params.status) search.set('status', params.status)
  if (params.lifecycleStatus) search.set('lifecycleStatus', params.lifecycleStatus)
  if (params.discoverySource) search.set('discovery_source', params.discoverySource)
  if (params.offset !== undefined) search.set('offset', String(params.offset))
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function fetchIngestionOverview(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockFetchIngestionOverview()
  return adminGet<IngestionOverview>('/admin/ingestion/overview', signal)
}

export function fetchIngestionActivity(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockFetchIngestionActivity()
  return adminGet<IngestionActivityResponse>('/admin/ingestion/activity', signal)
}

export function pauseIngestion(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockPauseIngestion()
  return adminPost<IngestionControlState>('/admin/ingestion/pause', signal)
}

/** Pause discovery and ingestion gates together (in-flight work continues). */
export async function pausePipeline(signal?: AbortSignal) {
  const [discovery, ingestion] = await Promise.all([
    pauseDiscovery(signal),
    pauseIngestion(signal),
  ])
  return { discovery, ingestion }
}

export function resumeIngestion(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockResumeIngestion()
  return adminPost<IngestionControlState>('/admin/ingestion/resume', signal)
}

export function pauseDiscovery(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockPauseDiscovery()
  return adminPost<IngestionControlState>('/admin/ingestion/discovery/pause', signal)
}

export function resumeDiscovery(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockResumeDiscovery()
  return adminPost<IngestionControlState>('/admin/ingestion/discovery/resume', signal)
}

export function fetchAdminDocuments(params: AdminDocumentQuery, signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockFetchAdminDocuments(params)
  return adminGet<AdminDocumentListResponse>(`/admin/documents${buildQuery(params)}`, signal)
}

export function fetchAdminDocument(docId: string, signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockFetchAdminDocument(docId)
  return adminGet<AdminDocumentDetail>(`/admin/documents/${encodeURIComponent(docId)}`, signal)
}

export function fetchIngestionErrors(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockFetchIngestionErrors()
  return adminGet<IngestionErrorsResponse>('/admin/ingestion/errors', signal)
}

export function retryDocument(docId: string, signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockRetryDocument(docId)
  return adminPost<RetryResponse>(`/admin/documents/${encodeURIComponent(docId)}/retry`, signal)
}

export function retryFailedDocuments(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockRetryFailedDocuments()
  return adminPost<RetryResponse>('/admin/documents/retry-failed', signal)
}

export function resumeAllIngestion(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockResumeAllIngestion()
  return adminPost<AdminResumeAllResponse>('/admin/ingestion/start', signal)
}

export function updateIngestionSyncSettings(
  settings: {
    audit_sync_enabled?: boolean
    reconciliation_interval_hours?: number
  },
  signal?: AbortSignal,
) {
  if (ADMIN_MOCK) return mockUpdateIngestionSyncSettings(settings)
  return adminPatch<IngestionOverview>('/admin/ingestion/sync-settings', settings, signal)
}

export function triggerAuditPoll(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockTriggerAuditPoll()
  return adminPost<IncrementalSyncResult>('/admin/ingestion/sync/audit-poll', signal)
}

export function triggerReconciliation(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockTriggerReconciliation()
  return adminPost<ReconciliationResult>('/admin/ingestion/sync/reconcile', signal)
}

export function mintAdminChatSession(signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockMintAdminChatSession()
  return adminPost<AdminChatSessionResponse>('/admin/chat/session', signal)
}

export function classifyMissingDocuments(limit = 10, signal?: AbortSignal) {
  if (ADMIN_MOCK) return mockClassifyMissingDocuments(limit)
  return adminPost<ReingestMissingClassificationResponse>(
    `/admin/classification/re-ingest-missing?limit=${limit}`,
    signal,
  )
}

/** Back-compat alias used by ReclassifyMissingButton. */
export function reingestMissingClassification(signal?: AbortSignal) {
  return classifyMissingDocuments(10, signal)
}
