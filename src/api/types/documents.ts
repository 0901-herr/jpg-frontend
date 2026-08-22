export interface DocumentItem {
  doc_id: string
  source_file: string
  doc_type: string
  title: string | null
  page_count: number
  ingestion_date: string
  namespace: string
}

export interface DocumentListResponse {
  documents: DocumentItem[]
  total: number
}

export interface BrowseDocumentsParams {
  category?: string
  namespace?: string
  offset?: number
  limit?: number
}
