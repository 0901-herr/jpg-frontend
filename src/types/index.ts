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
  /** Optional title for a durable in-thread failure. */
  errorTitle?: string
  /** Raw stage name behind `progressLabel` (e.g. "generating") — lets the
   * component that renders the label decide when to append an elapsed-time
   * ticker without re-parsing the formatted sentence. */
  progressStage?: string
  /** Display names of the documents in scope for this query, resolved once
   * at query start (`AppLayout.tsx`'s `handleSend`) — the file list the
   * progress ticker cycles through as "Searching <file>" while in flight,
   * and the fallback file list for "Reading <file>" during `generating`
   * before any citation has arrived. */
  progressScopeFiles?: string[]
  /** Folder names covering `progressScopeFiles`, resolved the same way and
   * at the same time — best-effort: a folder whose metadata hasn't been
   * loaded into the browse tree yet is simply left out, so this can be a
   * subset of (or absent from) the true set of folders in scope. */
  progressScopeFolders?: string[]
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
  /** Position/ahead/ETA from the most recent `queued` progress event
   * (design doc §4.1/§4.3) — raw wire values, unrounded and unvalidated;
   * `QueueCard` handles a missing, negative, or non-finite number
   * defensively rather than trusting it. Set only while `progressStage ===
   * 'queued'`; every other progress event (or the first streamed token,
   * which flips `status` away from `'thinking'`) is a fresh `onProgress`
   * call that overwrites all three back to `undefined`, which is what
   * makes the queue card disappear. */
  queuePosition?: number
  queueAhead?: number
  queueEtaSeconds?: number
  /** True for a durable in-thread failure the user can retry inline —
   * currently only the admission-queue's `at_capacity` event (design doc
   * §4.1/§4.3). Drives the "Try again" affordance in `ErrorMessage`; a
   * plain stream/network error stays retry-less (retrying it usually can't
   * help, and the owner rule against excessive guards cuts the other way
   * too — no affordance that implies retrying will fix something it can't). */
  retryable?: boolean
  /** The display name of whoever asked this turn — set server-side from
   * the acting user and echoed on every message DTO (`author_username`).
   * Rendered top-right above user bubbles. Prefer this over the viewer's
   * session name so shared chats attribute each sender correctly. Absent
   * only for an in-flight local message that has not round-tripped yet
   * — callers may fall back to the viewer's display name until POST
   * returns. */
  authorUsername?: string
}

export type ChatVisibility = 'private' | 'view' | 'query'

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
  /** The project this chat is grouped under in the sidebar, or `null`/
   * `undefined` for an ungrouped chat. */
  projectId?: string | null
  /** Sharing state — `private` (default) never shows a link; `view` lets
   * anyone with the link read the chat; `query` also lets them ask
   * questions. */
  visibility?: ChatVisibility
  /** Present only once `visibility` has ever been set to `view`/`query` —
   * `null`/`undefined` for a chat that has never been shared. */
  shareToken?: string | null
  /** Display name of the chat's owner — set on a session loaded from the
   * `Shared` group; a chat the viewer owns doesn't need it (their own
   * name), but it's populated there too when the server sends it. */
  ownerUsername?: string
  /** `false` only for a chat opened via a shared link the viewer doesn't
   * own. Absent/`true` for every chat the viewer created themselves. */
  isOwner?: boolean
  /** Whether the composer accepts new questions on this chat — always
   * `true` for an owned chat; for a shared chat this mirrors the owner's
   * chosen visibility (`true` only for `query`). */
  canQuery?: boolean
  /** Server-reported message count — used for the sidebar project-group
   * counts without requiring every chat's messages to be loaded. Falls
   * back to `messages.length` once messages have been fetched. */
  messageCount?: number
  /** The document ids this chat is scoped to server-side (its own
   * `scope_document_ids`, set from the query that started or last updated
   * it) — only populated once the full session detail has loaded (`GET
   * /chat/sessions/{id}` or `/chat/shared/{token}`), never from the
   * lighter list/summary endpoints. Used as the query scope for a shared
   * queryable chat when the viewer hasn't manually selected any documents
   * of their own (they may not even be able to browse these). */
  scopeDocumentIds?: string[]
  /** Same documents as `scopeDocumentIds`, paired with a resolved
   * filename (`null` when the viewer can't resolve one) — the composer's
   * read-only chips for a shared queryable chat, and the source for a
   * follower turn's user-bubble file tags, both come from this instead of
   * the viewer's own (possibly nonexistent) browse-tree metadata. Same
   * once-full-detail-loaded caveat as `scopeDocumentIds`. */
  scopeDocuments?: { documentId: string; filename: string | null }[]
}

/** A named group a chat can be filed under (Sidebar's "New project"
 * affordance) — purely organizational, never affects sharing or access. */
export interface ChatProject {
  id: string
  name: string
}

export interface UserProfile {
  name: string
  avatarInitial: string
}
