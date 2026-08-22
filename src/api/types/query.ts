export interface QueryRequest {
  query: string
  accuracy_tier?: 'fast' | 'standard' | 'accurate' | 'maximum'
  bucket?: string | null
  session_id?: string | null
  filters?: Record<string, unknown> | null
}

export interface Citation {
  doc_ref: string
  page_number?: number
  snippet?: string
  score?: number
  document_id?: string
  source_doc_ref?: string
  filename?: string
}

export interface QueryResponse {
  answer: string
  citations: Citation[]
  agent_trace?: Record<string, unknown>[] | null
  duration_ms: number
  model_used: string
}

export interface SendMessageRequest {
  chatId: string
  message: string
  sessionId?: string
  signal?: AbortSignal
  /** Scope retrieval to a single document (Qdrant/OpenSearch doc_id filter). */
  documentId?: string
}

export interface SendMessageResponse {
  messageId: string
  content: string
  fileTags?: string[]
  sources?: { index: number; filename: string; reference?: string }[]
  thinkingSeconds?: number
}
