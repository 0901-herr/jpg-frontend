export interface Source {
  index: number
  filename: string
  documentId?: string
  docRef?: string
  page?: number
  url?: string
  snippet?: string
  /** Display line e.g. "Page 2" */
  reference?: string
}

export interface CoverageInfo {
  total_files?: number
  ready_files?: number
  indexing_files?: number
  failed_files?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  fileTags?: string[]
  sources?: Source[]
  status?: 'thinking' | 'streaming' | 'complete' | 'error'
  /** Live pipeline stage while status is thinking (from RAG progress SSE). */
  progressLabel?: string
  /** Raw stage name behind `progressLabel` (e.g. "generating") — lets the
   * component that renders the label decide when to append an elapsed-time
   * ticker without re-parsing the formatted sentence. */
  progressStage?: string
  /** Epoch ms when this assistant placeholder was created — the basis for
   * the elapsed-time ticker shown during the silent generation phase. */
  startedAt?: number
  /** Raw, unattributed preview text from `delta` SSE events for the
   * segment currently being generated — rendered dimmed, ahead of
   * `content`. Reset to '' each time an `answer` segment finalizes that
   * text into `content`; never itself part of the final message. */
  liveText?: string
  thinkingSeconds?: number
  coverage?: CoverageInfo
  /** True when this answer was cut off — by switching chats mid-stream
   * (UX P0-3) or by a page reload mid-stream (UX P1-4) — rather than
   * finishing or erroring normally. Renders a short "Answer interrupted."
   * note instead of (or alongside) whatever partial text had arrived. */
  interrupted?: boolean
  /** True when the backend abstained — retrieval found nothing it could
   * answer from — rather than writing a normal or error response. Drives
   * the "No matching content" caption and suppresses the related-documents
   * list, which would otherwise show retrieval candidates as if they had
   * backed an answer that was never written. */
  abstained?: boolean
  /** The user question this answer responds to — set once, when the
   * assistant placeholder is created (`AppLayout.tsx`'s `handleSend`), so
   * `CitationList` can highlight the words in each snippet that actually
   * matter to this specific question, without having to look back at the
   * preceding user message in the session. Only query answers set this;
   * summary/categorize/metadata chat messages leave it unset. */
  question?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  /** ISO timestamp set when the session is first created — the basis for
   * the "Session {date} (n)" default title and its per-local-day numbering.
   * Absent on sessions created before this field existed (or restored from
   * an older localStorage payload); those keep whatever title they already
   * had rather than being renamed. */
  createdAt?: string
}

export interface UserProfile {
  name: string
  avatarInitial: string
}
