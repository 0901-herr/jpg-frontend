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
  /** rag-engine sends `abstention` (reason + message) then an `answer`
   * event carrying the canned "couldn't find relevant content" message,
   * when it declines to answer from the retrieved context. Any citations
   * already streamed in before this point were retrieval candidates, not
   * actual sources for an answer that was never written — they're dropped
   * (see `streamQuery`'s `abstained` handling) and this fires so callers
   * can clear whatever sources they'd already shown. */
  onAbstention?: (payload: { reason?: string; message?: string }) => void
  onDone?: (payload: { duration_ms?: number }) => void
  onError?: (message: string) => void
}

/** Per-query accuracy tier — maps to rag-engine accuracy_tier once the adapter forwards it. */
export type QueryTier = 'fast' | 'standard' | 'accurate'

export interface QueryRequest {
  question: string
  documents?: string[]
  tier?: QueryTier
  /** The chat this question belongs to — lets the adapter gate a shared
   * (non-owner) request against the chat's visibility. Omitted only for
   * flows that don't have a persisted chat id yet. */
  conversation_id?: string
}

export interface SendMessageRequest {
  chatId: string
  message: string
  documents: string[]
  tier?: QueryTier
  /** True for a follower asking a shared queryable chat: the adapter
   * always uses the chat's own stored scope for these, never a document
   * list the follower sends (it can't choose files at all — see
   * AppLayout.tsx's `isSharedQueryable`) — so `documents` is left off the
   * wire payload entirely rather than sent and ignored. */
  omitDocuments?: boolean
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
