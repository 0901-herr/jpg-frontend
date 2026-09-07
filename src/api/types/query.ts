import type { Source } from '../../types'

export interface Citation {
  doc_ref: string
  /** Adapter field */
  page?: number
  /** RAG legacy field */
  page_number?: number
  snippet?: string
  score?: number
  document_id?: string
  filename?: string
  url?: string
  item_id?: string
  chunk_id?: string
  source_doc_ref?: string
}

export interface CoverageEvent {
  total_files?: number
  ready_files?: number
  indexing_files?: number
  failed_files?: number
}

export interface StreamQueryCallbacks {
  onCoverage?: (coverage: CoverageEvent) => void
  onAnswer?: (delta: string) => void
  /** Batch of citations from a single SSE citation event */
  onCitations?: (citations: Citation[]) => void
  onDone?: (payload: { duration_ms?: number }) => void
  onError?: (message: string) => void
}

export interface QueryRequest {
  question: string
  documents: string[]
}

export interface SendMessageRequest {
  chatId: string
  message: string
  documents: string[]
  signal?: AbortSignal
  callbacks?: StreamQueryCallbacks
}

export interface SendMessageResponse {
  messageId: string
  content: string
  fileTags?: string[]
  sources?: Source[]
  thinkingSeconds?: number
  coverage?: CoverageEvent
}

/** Legacy sync response shape (kept for reference). */
export interface QueryResponse {
  answer: string
  citations: Citation[]
  agent_trace?: Record<string, unknown>[] | null
  duration_ms: number
  model_used: string
}
