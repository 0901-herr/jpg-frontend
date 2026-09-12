import { adminGet, adminPost } from './adminHttp'
import type {
  AdminChatSessionResponse,
  AdminDocumentDetail,
  AdminDocumentListResponse,
  AdminDocumentQuery,
  AdminResumeAllResponse,
  IngestionControlState,
  IngestionErrorsResponse,
  IngestionOverview,
  ReingestMissingClassificationResponse,
  RetryResponse,
} from './types/admin'

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
  return adminGet<IngestionOverview>('/admin/ingestion/overview', signal)
}

export function pauseIngestion(signal?: AbortSignal) {
  return adminPost<IngestionControlState>('/admin/ingestion/pause', signal)
}

export function resumeIngestion(signal?: AbortSignal) {
  return adminPost<IngestionControlState>('/admin/ingestion/resume', signal)
}

export function pauseDiscovery(signal?: AbortSignal) {
  return adminPost<IngestionControlState>('/admin/ingestion/discovery/pause', signal)
}

export function resumeDiscovery(signal?: AbortSignal) {
  return adminPost<IngestionControlState>('/admin/ingestion/discovery/resume', signal)
}

export function fetchAdminDocuments(params: AdminDocumentQuery, signal?: AbortSignal) {
  return adminGet<AdminDocumentListResponse>(`/admin/documents${buildQuery(params)}`, signal)
}

export function fetchAdminDocument(docId: string, signal?: AbortSignal) {
  return adminGet<AdminDocumentDetail>(`/admin/documents/${encodeURIComponent(docId)}`, signal)
}

export function fetchIngestionErrors(signal?: AbortSignal) {
  return adminGet<IngestionErrorsResponse>('/admin/ingestion/errors', signal)
}

export function retryDocument(docId: string, signal?: AbortSignal) {
  return adminPost<RetryResponse>(`/admin/documents/${encodeURIComponent(docId)}/retry`, signal)
}

export function retryFailedDocuments(signal?: AbortSignal) {
  return adminPost<RetryResponse>('/admin/documents/retry-failed', signal)
}

export function resumeAllIngestion(signal?: AbortSignal) {
  return adminPost<AdminResumeAllResponse>('/admin/ingestion/resume-all', signal)
}

export function mintAdminChatSession(signal?: AbortSignal) {
  return adminPost<AdminChatSessionResponse>('/admin/chat/session', signal)
}

export function classifyMissingDocuments(limit = 10, signal?: AbortSignal) {
  return adminPost<ReingestMissingClassificationResponse>(
    `/admin/classification/re-ingest-missing?limit=${limit}`,
    signal,
  )
}

/** Back-compat alias used by ReclassifyMissingButton. */
export function reingestMissingClassification(signal?: AbortSignal) {
  return classifyMissingDocuments(10, signal)
}
