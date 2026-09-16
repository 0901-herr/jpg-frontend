export type IndexingStatus = 'READY' | 'PARTIAL' | 'INDEXING' | 'FAILED' | 'NOT_INDEXED'

export type SummaryStatus = 'READY' | 'PENDING' | 'FAILED' | 'NOT_AVAILABLE'

export interface BrowseFolderNode {
  folder_id: number
  name: string
  parent_id: number | null
  has_children: boolean
}

export interface BrowseDocumentItem {
  document_id: string
  filename: string
  file_type: string
  updated_at: string
  folder_id: number
  indexing_status: IndexingStatus
  rag_document_id: string | null
  classification_category?: string | null
  summary_status?: SummaryStatus | null
  status_reason?: string | null
  queryable: boolean
}

export interface BrowseFolderContentsResponse {
  folder: BrowseFolderNode
  folders: BrowseFolderNode[]
  documents: BrowseDocumentItem[]
  page: number
  has_more_documents: boolean
}

export interface BrowseSubtreeDocumentsResponse {
  folder: BrowseFolderNode
  documents: BrowseDocumentItem[]
  folder_count: number
  truncated: boolean
}

export interface BrowseRootResponse {
  root_folder_id: number
  username: string
}

export interface QueryScopeRequest {
  documents: string[]
}

export interface QueryScopeResponse {
  total_files: number
  ready_files: number
  indexing_files: number
  failed_files: number
  missing_files: number
  accessible_document_ids: string[]
}

export interface DocumentViewUrlResponse {
  url: string
}

export interface BrowseCategoriesRequest {
  documents: string[]
}

export interface BrowseCategoryGroup {
  name: string
  count: number
}

export interface BrowseCategoriesResponse {
  categories: BrowseCategoryGroup[]
  uncategorized_count: number
  accessible_document_ids: string[]
  note?: string | null
}

export interface DocumentSummaryResponse {
  document_id: string
  filename: string | null
  summary: string | null
  summary_status: SummaryStatus | null
  status_reason: string | null
}

export interface BrowseStatusRequest {
  document_ids: string[]
}

/** Cheap per-document status patch — a subset of BrowseDocumentItem's fields. */
export interface BrowseStatusItem {
  document_id: string
  indexing_status: IndexingStatus
  status_reason: string | null
  queryable: boolean
  summary_status: SummaryStatus | null
  classification_category: string | null
  rag_document_id: string | null
}

export interface BrowseStatusResponse {
  documents: BrowseStatusItem[]
}

export interface MetadataExtractionResponse {
  document_id: string
  filename: string
  /** Extracted field values, keyed by label. A value may be the literal
   * string "Not stated" when the document doesn't state it. */
  fields: Record<string, string>
  /** Display order for `fields` — the deployment's configured field
   * labels, in order, followed by any extra labels resolved from the
   * document's own LogicalDOC template. Always present (unlike the old
   * `extra_fields`-optional contract, this field is required — see
   * jpg-adapter Task 3 Step 6). */
  field_order: string[]
  /** Full "Arche AI extracted metadata — ..." comment text pushed to LogicalDOC. */
  comment: string
  /** Whether `comment` was successfully saved as a LogicalDOC document comment. */
  pushed: boolean
  push_error: string | null
  /** Labels in `fields` beyond the deployment's fixed configured set —
   * the document's (or the attribute set's) own extended attribute
   * definitions, in the order the adapter reported them. */
  extra_fields?: string[]
  /** Extra attribute names the adapter found but couldn't ask about (a
   * non-string type) — informational only, never rendered as a field row. */
  skipped_fields?: string[]
}

/** One of the folder's current subfolders, offered to the model as a
 * possible destination for the categorize call. */
export interface CategorizeCandidate {
  folder_id: number
  name: string
}

/** Response from `POST /browse/documents/{document_id}/categorize` — the
 * model picks one of the current folder's subfolders (`category`) or
 * abstains (`category: null`, `abstained: true`). `abstained: false` with
 * `category: null` means the model's answer could not be matched to any
 * candidate folder name. */
export interface DocumentCategorizeResponse {
  document_id: string
  filename: string
  folder_id: number
  folder_name: string
  category: string | null
  abstained: boolean
  target_folder_id: number | null
  confidence: number
  reasoning: string
  candidates: CategorizeCandidate[]
  latency_ms: number
}
