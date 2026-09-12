export type IndexingStatus = 'READY' | 'INDEXING' | 'FAILED' | 'NOT_INDEXED'

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
  queryable: boolean
}

export interface BrowseFolderContentsResponse {
  folder: BrowseFolderNode
  folders: BrowseFolderNode[]
  documents: BrowseDocumentItem[]
  page: number
  has_more_documents: boolean
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
