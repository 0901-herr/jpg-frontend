import { apiFetchBlob, apiGet } from './http'
import type { BrowseDocumentsParams, DocumentListResponse } from './types/documents'

export async function browseDocuments(
  params: BrowseDocumentsParams = {},
): Promise<DocumentListResponse> {
  const search = new URLSearchParams()
  if (params.category) search.set('category', params.category)
  if (params.namespace) search.set('namespace', params.namespace)
  if (params.offset != null) search.set('offset', String(params.offset))
  if (params.limit != null) search.set('limit', String(params.limit))

  const qs = search.toString()
  return apiGet<DocumentListResponse>(`/documents/browse${qs ? `?${qs}` : ''}`)
}

export async function fetchDocumentFile(docId: string): Promise<Blob> {
  return apiFetchBlob(`/documents/${encodeURIComponent(docId)}/file`)
}
