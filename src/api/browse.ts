import { apiGet, apiPost } from './http'
import type {
  BrowseFolderContentsResponse,
  BrowseRootResponse,
  QueryScopeRequest,
  QueryScopeResponse,
} from './types/browse'

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

export function withPageHint(url: string, page?: number): string {
  if (page == null || page < 1) return url
  if (url.includes('#page=')) return url
  return `${url}#page=${page}`
}
