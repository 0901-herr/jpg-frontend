import { apiGet, apiPost } from './http'
import type {
  BrowseCategoriesRequest,
  BrowseCategoriesResponse,
  BrowseFolderContentsResponse,
  BrowseRootResponse,
  BrowseStatusRequest,
  BrowseStatusResponse,
  DocumentSummaryResponse,
  MqaMetadataResponse,
  QueryScopeRequest,
  QueryScopeResponse,
} from './types/browse'

/** LogicalDOC document ids per /browse/status call — enforced by the adapter. */
const BROWSE_STATUS_MAX_IDS = 500

export async function fetchBrowseRoot(): Promise<BrowseRootResponse> {
  return apiGet<BrowseRootResponse>('/browse/root')
}

export async function fetchFolderContents(
  folderId: number,
  page = 0,
): Promise<BrowseFolderContentsResponse> {
  const query = page > 0 ? `?page=${page}` : ''
  return apiGet<BrowseFolderContentsResponse>(`/browse/folders/${folderId}${query}`)
}

export async function fetchBrowseCategories(
  documents: string[],
  signal?: AbortSignal,
): Promise<BrowseCategoriesResponse> {
  return apiPost<BrowseCategoriesResponse>(
    '/browse/categories',
    { documents } satisfies BrowseCategoriesRequest,
    true,
    signal,
  )
}

/**
 * Cheap status-only lookup for the auto-refresh poll — one bulk call
 * instead of a full per-folder browse fetch (~3 LogicalDOC REST calls
 * each). Chunks into batches of BROWSE_STATUS_MAX_IDS since the adapter
 * caps each call; ids without a mapping are simply omitted by the adapter.
 */
export async function fetchBrowseStatus(
  documentIds: string[],
  signal?: AbortSignal,
): Promise<BrowseStatusResponse> {
  if (documentIds.length === 0) return { documents: [] }

  const chunks: string[][] = []
  for (let i = 0; i < documentIds.length; i += BROWSE_STATUS_MAX_IDS) {
    chunks.push(documentIds.slice(i, i + BROWSE_STATUS_MAX_IDS))
  }

  // Merge whatever chunks succeed — a single slow/failed chunk (out of
  // potentially several hundred ids' worth) shouldn't blank out the status
  // of every other document that DID come back. Only reject if every chunk
  // failed, so callers can still tell a total outage from a partial one.
  const settled = await Promise.allSettled(
    chunks.map((chunk) =>
      apiPost<BrowseStatusResponse>(
        '/browse/status',
        { document_ids: chunk } satisfies BrowseStatusRequest,
        true,
        signal,
      ),
    ),
  )

  const fulfilled = settled.filter(
    (result): result is PromiseFulfilledResult<BrowseStatusResponse> => result.status === 'fulfilled',
  )
  if (fulfilled.length === 0) {
    throw (settled[0] as PromiseRejectedResult).reason
  }

  return { documents: fulfilled.flatMap((result) => result.value.documents) }
}

export async function validateQueryScope(
  documents: string[],
  signal?: AbortSignal,
): Promise<QueryScopeResponse> {
  return apiPost<QueryScopeResponse>(
    '/browse/query-scope',
    { documents } satisfies QueryScopeRequest,
    true,
    signal,
  )
}

export async function fetchDocumentViewUrl(documentId: string, page?: number): Promise<string> {
  const query = page != null && page >= 1 ? `?page=${page}` : ''
  const response = await apiGet<{ url: string }>(
    `/browse/documents/${documentId}/view-url${query}`,
  )
  return response.url
}

export async function fetchDocumentSummary(
  documentId: string,
  signal?: AbortSignal,
): Promise<DocumentSummaryResponse> {
  return apiGet<DocumentSummaryResponse>(`/browse/documents/${documentId}/summary`, true, signal)
}

/** Runs Arche AI MQA metadata extraction for a document and (best effort,
 * reflected in `pushed`/`push_error`) saves it back to LogicalDOC as a
 * comment. Empty body per the contract — the document id in the path is
 * all the backend needs. Takes 20-90s on the CPU-only extraction server. */
export async function extractMqaMetadata(
  documentId: string,
  signal?: AbortSignal,
): Promise<MqaMetadataResponse> {
  return apiPost<MqaMetadataResponse>(
    `/browse/documents/${documentId}/mqa-metadata`,
    {},
    true,
    signal,
  )
}

export function withPageHint(url: string, page?: number): string {
  if (page == null || page < 1) return url
  if (url.includes('#page=')) return url
  return `${url}#page=${page}`
}
