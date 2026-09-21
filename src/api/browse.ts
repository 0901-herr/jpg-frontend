import { apiGet, apiPost } from './http'
import { isLayoutDemoEnabled } from '../config/demo'
import type {
  BrowseCategoriesRequest,
  BrowseCategoriesResponse,
  BrowseDocumentItem,
  BrowseFolderContentsResponse,
  BrowseFolderNode,
  BrowseRootResponse,
  BrowseStatusRequest,
  BrowseStatusResponse,
  BrowseSubtreeDocumentsResponse,
  DocumentCategorizeResponse,
  DocumentSummaryResponse,
  MetadataExtractionResponse,
  QueryScopeRequest,
  QueryScopeResponse,
} from './types/browse'

/** LogicalDOC document ids per /browse/status call — enforced by the adapter. */
const BROWSE_STATUS_MAX_IDS = 500

const COMPOSER_DEMO_FOLDERS: Record<number, BrowseFolderNode> = {
  1: { folder_id: 1, name: 'Company documents', parent_id: null, has_children: true },
  2: { folder_id: 2, name: 'Policies', parent_id: 1, has_children: true },
  3: { folder_id: 3, name: 'Finance', parent_id: 1, has_children: true },
  4: { folder_id: 4, name: 'People', parent_id: 1, has_children: true },
  5: { folder_id: 5, name: 'Projects', parent_id: 1, has_children: true },
}

function demoDocument(
  document_id: string,
  filename: string,
  folder_id: number,
  classification_category: string,
): BrowseDocumentItem {
  return {
    document_id,
    filename,
    file_type: filename.split('.').pop() ?? 'pdf',
    updated_at: '2026-09-10T10:28:00Z',
    folder_id,
    indexing_status: 'READY',
    rag_document_id: `demo-rag-${document_id}`,
    classification_category,
    summary_status: 'READY',
    status_reason: null,
    queryable: true,
  }
}

const COMPOSER_DEMO_DOCUMENTS: Record<number, BrowseDocumentItem[]> = {
  1: [demoDocument('demo-handbook', 'Company_Handbook_2026.pdf', 1, 'General')],
  2: [
    demoDocument('demo-workplace-policy', 'Workplace_Policy_2026.pdf', 2, 'Policies'),
    demoDocument('demo-security-policy', 'Information_Security_Policy.pdf', 2, 'Policies'),
    demoDocument('demo-leave-policy', 'Leave_and_Benefits_Guide.pdf', 2, 'Policies'),
  ],
  3: [
    demoDocument('demo-q3-report', 'Q3_Financial_Report.pdf', 3, 'Finance'),
    demoDocument('demo-budget', 'FY2027_Budget.xlsx', 3, 'Finance'),
  ],
  4: [
    demoDocument('demo-onboarding', 'New_Starter_Onboarding.docx', 4, 'People'),
    demoDocument('demo-org-chart', 'Organisation_Chart.pdf', 4, 'People'),
  ],
  5: [
    demoDocument('demo-project-atlas', 'Project_Atlas_Brief.pdf', 5, 'Projects'),
    demoDocument('demo-project-nova', 'Project_Nova_Status.docx', 5, 'Projects'),
  ],
}

export async function fetchBrowseRoot(): Promise<BrowseRootResponse> {
  if (isLayoutDemoEnabled()) return { root_folder_id: 1, username: 'Demo user' }
  return apiGet<BrowseRootResponse>('/browse/root')
}

export async function fetchFolderContents(
  folderId: number,
  page = 0,
): Promise<BrowseFolderContentsResponse> {
  if (isLayoutDemoEnabled()) {
    const folder = COMPOSER_DEMO_FOLDERS[folderId] ?? COMPOSER_DEMO_FOLDERS[1]
    return {
      folder,
      folders:
        folderId === 1
          ? [2, 3, 4, 5].map((id) => COMPOSER_DEMO_FOLDERS[id])
          : [],
      documents: page === 0 ? (COMPOSER_DEMO_DOCUMENTS[folderId] ?? []) : [],
      page,
      has_more_documents: false,
    }
  }
  const query = page > 0 ? `?page=${page}` : ''
  return apiGet<BrowseFolderContentsResponse>(`/browse/folders/${folderId}${query}`)
}

/**
 * Every document under folderId and all its descendant folders — powers
 * checking a folder in the file-selection tree ("check the root = every
 * file"), instead of only the immediate contents fetchFolderContents
 * returns.
 */
export async function fetchSubtreeDocuments(
  folderId: number,
): Promise<BrowseSubtreeDocumentsResponse> {
  if (isLayoutDemoEnabled()) {
    const contents = await fetchFolderContents(folderId)
    const documents =
      folderId === 1
        ? Object.values(COMPOSER_DEMO_DOCUMENTS).flat()
        : contents.documents
    return {
      folder: contents.folder,
      documents,
      folder_count: contents.folders.length + 1,
      truncated: false,
    }
  }
  return apiGet<BrowseSubtreeDocumentsResponse>(`/browse/folders/${folderId}/subtree-documents`)
}

export async function fetchBrowseCategories(
  documents: string[],
  signal?: AbortSignal,
): Promise<BrowseCategoriesResponse> {
  if (isLayoutDemoEnabled()) {
    return {
      categories: [{ name: 'Policies', count: documents.length }],
      uncategorized_count: 0,
      accessible_document_ids: documents,
    }
  }
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
  if (isLayoutDemoEnabled()) {
    return {
      documents: documentIds.map((document_id) => ({
        document_id,
        indexing_status: 'READY',
        status_reason: null,
        queryable: true,
        summary_status: 'READY',
        classification_category: 'Policies',
        rag_document_id: `demo-rag-${document_id}`,
      })),
    }
  }

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
  if (isLayoutDemoEnabled()) {
    return {
      total_files: documents.length,
      ready_files: documents.length,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: documents,
    }
  }
  return apiPost<QueryScopeResponse>(
    '/browse/query-scope',
    { documents } satisfies QueryScopeRequest,
    true,
    signal,
  )
}

export async function fetchDocumentViewUrl(documentId: string, page?: number): Promise<string> {
  if (isLayoutDemoEnabled()) {
    const base = (import.meta.env.VITE_LOGICALDOC_BASE_URL ?? 'http://localhost:8082').replace(
      /\/$/,
      '',
    )
    const url = `${base}/frontend.jsp?docId=${encodeURIComponent(documentId)}`
    return page != null && page >= 1 ? `${url}&page=${page}` : url
  }
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

/** Runs Arche AI metadata extraction for a document and (best effort,
 * reflected in `pushed`/`push_error`) saves it back to LogicalDOC as a
 * comment. Empty body per the contract — the document id in the path is
 * all the backend needs. Takes 20-90s on the CPU-only extraction server. */
export async function extractMetadata(
  documentId: string,
  signal?: AbortSignal,
): Promise<MetadataExtractionResponse> {
  return apiPost<MetadataExtractionResponse>(
    `/browse/documents/${documentId}/extract-metadata`,
    {},
    true,
    signal,
  )
}

/** Runs Arche AI categorization for a document: the model picks one of the
 * current folder's subfolders as a destination, or abstains. Empty body
 * per the contract, same shape as `extractMetadata`. The user still
 * moves the file by hand in LogicalDOC — this only suggests where. */
export async function categorizeDocument(
  documentId: string,
  signal?: AbortSignal,
): Promise<DocumentCategorizeResponse> {
  return apiPost<DocumentCategorizeResponse>(
    `/browse/documents/${documentId}/categorize`,
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
