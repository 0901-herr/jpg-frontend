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
  /** `payload` is the full progress event data (stage included) — e.g.
   * `{ stage: 'retrieved', candidates: 3, distinct_items: 2 }` — so callers
   * can build a detailed, stage-specific label instead of a fixed sentence
   * per stage. */
  onProgress?: (stage: string, payload: Record<string, unknown>) => void
  onRoute?: (strategy: string) => void
  /** Raw, safe-to-reveal token text from a `delta` SSE event — a live
   * preview of the segment currently being generated. Never accumulated
   * into the final message content; superseded by the next `onAnswer`
   * call for that segment. */
  onDelta?: (text: string) => void
  onAnswer?: (delta: string) => void
  /** Batch of citations from a single SSE citation event */
  onCitations?: (citations: Citation[]) => void
  onDone?: (payload: { duration_ms?: number }) => void
  onError?: (message: string) => void
}

/** Per-query accuracy tier — maps to rag-engine accuracy_tier once the adapter forwards it. */
export type QueryTier = 'fast' | 'standard' | 'accurate'

export interface QueryRequest {
  question: string
  documents: string[]
  tier?: QueryTier
}

export interface SendMessageRequest {
  chatId: string
  message: string
  documents: string[]
  tier?: QueryTier
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
