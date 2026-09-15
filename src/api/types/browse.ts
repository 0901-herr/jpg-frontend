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

/** The six MQA fields, always present in this order (a value may be the
 * literal string "Not stated" when the document doesn't state it). */
export interface MqaMetadataFields {
  'Document Title': string
  Faculty: string
  'Programme name and code': string
  'Academic year': string
  'Accreditation body': string
  'Programme Coordinator': string
}

export interface MqaMetadataResponse {
  document_id: string
  filename: string
  fields: MqaMetadataFields
  /** Full "Arche AI extracted metadata — ..." comment text pushed to LogicalDOC. */
  comment: string
  /** Whether `comment` was successfully saved as a LogicalDOC document comment. */
  pushed: boolean
  push_error: string | null
}
