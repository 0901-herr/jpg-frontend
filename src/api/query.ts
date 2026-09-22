import { ApiError, apiPostStream, consumeSseStream } from './http'
import type {
  Citation,
  CoverageEvent,
  QueryRequest,
  SendMessageRequest,
  SendMessageResponse,
  StreamQueryCallbacks,
} from './types/query'
import {
  citationsToSources,
  citationsToTags,
  mergeCitations,
  parseCitationEvent,
} from '../utils/citations'
import { appendStreamDelta } from '../utils/appendStreamDelta'
import {
  QUERY_GENERIC_ERROR,
  QUERY_INCOMPLETE_ERROR,
  toUserFacingQueryError,
} from '../utils/userFacingErrors'
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key]
  return typeof v === 'string' ? v : undefined
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key]
  return typeof v === 'number' ? v : undefined
}

function parseCoverage(data: unknown): CoverageEvent {
  const obj = asRecord(data)
  if (!obj) return {}
  return {
    total_files: readNumber(obj, 'total_files'),
    ready_files: readNumber(obj, 'ready_files'),
    indexing_files: readNumber(obj, 'indexing_files'),
    failed_files: readNumber(obj, 'failed_files'),
  }
}

function extractAnswerDelta(data: unknown): string {
  const obj = asRecord(data)
  if (!obj) return typeof data === 'string' ? data : ''
  return readString(obj, 'delta') ?? readString(obj, 'text') ?? readString(obj, 'answer') ?? ''
}

/** Each `answer` SSE event is a whole citation-attributed segment (a clause or
 * sentence), not a token/sub-word delta — rag-engine's contract splits the
 * answer at citation-marker boundaries, one segment per source. Naively
 * concatenating them with no separator runs adjacent segments together
 * ("in,there", "incident.mentions"). Insert exactly one joining space unless
 * one already exists on either side, or the segment starts with punctuation
 * that shouldn't be preceded by a space. */
export function joinAnswerSegment(existing: string, next: string): string {
  if (!existing || !next) return existing + next
  const needsSpace = !/\s$/.test(existing) && !/^[\s.,;:!?)\]}]/.test(next)
  return needsSpace ? `${existing} ${next}` : existing + next
}

/** Matches a Markdown list-item marker ("- ", "* ", "• ", "1. ", "2) ")
 * followed by its item text, at the start of a line — i.e. marker and text
 * arrived in the same segment. */
const LIST_MARKER_RE = /^\s*([-*•]|\d+[.)])\s/

/** Matches a segment that consists solely of a list marker with no item
 * text ("1.", "-", "*") — rag-engine's AnswerSegmenter has been observed
 * emitting the marker as its own segment, separate from the label that
 * follows ("1.", then "Programme Rationale", then "2.", ...), unlike
 * LIST_MARKER_RE's "marker + text in one segment" shape above. */
const BARE_LIST_MARKER_RE = /^\s*(\d+\.|-|\*)\s*$/

/** Strips one trailing `[DocN]`-style citation marker (and surrounding
 * whitespace) off the end of a string — citations are appended to a
 * segment's own text (see `rawDelta` below) before it's ever added to
 * `content`, so a completed line's citation has to be looked past to see
 * whether there's any real label text before it. */
function stripTrailingCitationMarker(text: string): string {
  return text.replace(/\s*\[[^[\]\n]*\]\s*$/, '')
}

/** Matches text that ends a sentence: one of `. ! ? : ;`, optionally
 * followed by a single closing quote or bracket (a period can land just
 * inside a closing quote/paren, e.g. `done."` or `(see above.)`). */
const SENTENCE_TERMINATOR_RE = /[.!?:;]["'”’)\]}]?$/

/**
 * rag-engine's AnswerSegmenter ends a segment at an inline `[DocN]` marker,
 * not at a sentence boundary — so a single sentence like "The minutes
 * [Doc2] document the framework but…" arrives as two segments ("The
 * minutes", cited; "document the framework but…", uncited), each with a
 * *different* citation ref (or none). Naively treating every citation
 * change as a new fact/new paragraph (see `citationChanged` below) reads
 * that mid-sentence split as two unrelated topics.
 *
 * A segment is a continuation of the same sentence — joined with a single
 * space, never a new paragraph — when it starts with a lowercase letter
 * (a genuinely new sentence never does), or when the text accumulated so
 * far (its own trailing `[DocN]` marker aside — that's punctuation *we*
 * appended, not the model's) doesn't already end a sentence. This holds
 * regardless of whether the citation ref changed.
 */
function isSentenceContinuation(content: string, segmentText: string): boolean {
  if (/^[a-z]/.test(segmentText.trimStart())) return true
  const priorText = stripTrailingCitationMarker(content)
  return !SENTENCE_TERMINATOR_RE.test(priorText)
}

/** True if the last line of `text` is a Markdown list item *with* label
 * text — used to decide whether a following list-item segment continues
 * the same list (single newline) or starts a new one (blank line first).
 *
 * A bare marker segment ("1.") still gets a citation appended the same way
 * a real item does ("1. [Doc1]"), which on its own satisfies
 * LIST_MARKER_RE (marker followed by whitespace) — so without stripping
 * the citation first and checking for leftover text, a cited bare marker
 * would be misread as a *complete* list item and force a spurious blank
 * line before its own label segment. */
function endsWithListItemLine(text: string): boolean {
  const lastLine = text.slice(text.lastIndexOf('\n') + 1)
  if (BARE_LIST_MARKER_RE.test(stripTrailingCitationMarker(lastLine))) return false
  return LIST_MARKER_RE.test(lastLine)
}

/** Find the citation an `answer` segment belongs to, by chunk_id (falling
 * back to item_id+page for segments without one), and return its doc_ref
 * (e.g. "[Doc1]") — the exact literal token splitAnswerByDocRefs (utils/
 * citations.ts) looks for to render an inline, clickable source link.
 * rag-engine strips [DocN] markers from the text itself (they're replaced
 * by these same structured fields), so without this the reference is lost
 * entirely instead of rendered — this puts it back using data we already
 * have, no backend change needed. */
export function citationRefForSegment(data: unknown, citations: Citation[]): string | null {
  const obj = asRecord(data)
  if (!obj) return null
  const chunkId = readString(obj, 'chunk_id')
  const itemId = readString(obj, 'item_id')
  const page = readNumber(obj, 'page')
  const match = citations.find((c) => {
    if (chunkId) return c.chunk_id === chunkId
    if (!itemId) return false
    return c.item_id === itemId && (page == null || c.page === page || c.page_number === page)
  })
  return match?.doc_ref || null
}

function dispatchNestedMessageEvent(
  data: unknown,
  callbacks: StreamQueryCallbacks,
): boolean {
  const obj = asRecord(data)
  if (!obj) return false
  const nestedType = readString(obj, 'type') ?? readString(obj, 'event')
  if (!nestedType) return false

  if (nestedType === 'progress') {
    const stage =
      readString(obj, 'stage') ?? readString(obj, 'status') ?? readString(obj, 'phase')
    if (stage) callbacks.onProgress?.(stage, obj)
    return true
  }

  if (nestedType === 'route') {
    const strategy = readString(obj, 'strategy') ?? readString(obj, 'query_type')
    if (strategy) callbacks.onRoute?.(strategy)
    return true
  }

  if (nestedType === 'coverage') {
    const coverage = parseCoverage(data)
    callbacks.onCoverage?.(coverage)
    return true
  }

  return false
}

function extractErrorMessage(data: unknown): string {
  const obj = asRecord(data)
  if (!obj) {
    return typeof data === 'string' ? toUserFacingQueryError(data) : QUERY_GENERIC_ERROR
  }
  const raw =
    readString(obj, 'message') ??
    readString(obj, 'detail') ??
    readString(obj, 'error') ??
    undefined
  return toUserFacingQueryError(raw)
}

async function streamQuery(
  payload: QueryRequest,
  callbacks: StreamQueryCallbacks,
  signal?: AbortSignal,
): Promise<{
  content: string
  citations: Citation[]
  coverage?: CoverageEvent
  durationMs?: number
  messageId?: string
}> {
  const toFriendlyStreamError = (err: unknown): string => {
    const httpStatus = err instanceof ApiError ? err.status : undefined
    // `ApiError.detail` only (not `.message`, which falls back to the raw
    // HTTP reason phrase, e.g. "Forbidden") — `toUserFacingQueryError`'s
    // 403 branch surfaces this verbatim when present, so it must be a real
    // body message or nothing, never a technical statusText standing in
    // for one.
    const raw = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : undefined
    return toUserFacingQueryError(raw, { httpStatus })
  }

  let response: Response
  let coverageFromHeaders: { total?: number; ready?: number; indexing?: number }

  try {
    ;({ response, coverageFromHeaders } = await apiPostStream('/query', payload, true, signal))
  } catch (err) {
    if (signal?.aborted) throw err
    const message = toFriendlyStreamError(err)
    callbacks.onError?.(message)
    throw new Error(message)
  }

  if (
    coverageFromHeaders.total != null ||
    coverageFromHeaders.ready != null ||
    coverageFromHeaders.indexing != null
  ) {
    callbacks.onCoverage?.({
      total_files: coverageFromHeaders.total,
      ready_files: coverageFromHeaders.ready,
      indexing_files: coverageFromHeaders.indexing,
    })
  }

  let content = ''
  // Tracks the previous `answer` segment's citation ref (e.g. "[Doc3]") so
  // a segment that switches to a different source starts a new paragraph
  // instead of running on from the last one — see the 'answer' case below.
  let lastAnswerRef: string | null = null
  let citations: Citation[] = []
  let coverage: CoverageEvent | undefined
  let durationMs: number | undefined
  let streamError: string | null = null
  let terminalEvent = false
  // The persisted assistant chat_message id (Item 3, additive field —
  // absent on an older adapter): the adapter now persists the assistant
  // turn server-side before emitting `done`, and `done.message_id` is that
  // row's own id. `sendMessage` prefers this over a fresh client-generated
  // uuid so `recordAssistantMessage`'s POST lands as an idempotent upsert
  // against the row the adapter already created, instead of creating a
  // second, orphaned one.
  let messageId: string | undefined
  // Sticky once set: an `abstention` event means whatever citations
  // arrived before it were retrieval candidates for an answer that was
  // never written, not real sources — drop them, and ignore any further
  // `citation` events for the rest of this stream.
  let abstained = false

  try {
    await consumeSseStream(
      response,
      ({ event, data }) => {
        switch (event) {
          case 'coverage': {
            coverage = parseCoverage(data)
            callbacks.onCoverage?.(coverage)
            break
          }
          case 'progress': {
            const obj = asRecord(data)
            const stage = obj ? readString(obj, 'stage') : undefined
            if (stage) callbacks.onProgress?.(stage, obj ?? {})
            break
          }
          case 'route': {
            const obj = asRecord(data)
            const strategy =
              (obj ? readString(obj, 'strategy') : undefined) ??
              (obj ? readString(obj, 'query_type') : undefined)
            if (strategy) callbacks.onRoute?.(strategy)
            break
          }
          case 'delta': {
            const obj = asRecord(data)
            const text = obj ? readString(obj, 'text') : undefined
            if (text) callbacks.onDelta?.(text)
            break
          }
          case 'answer': {
            const segmentText = extractAnswerDelta(data)
            if (segmentText) {
              const ref = citationRefForSegment(data, citations)
              const rawDelta = ref ? joinAnswerSegment(segmentText, ref) : segmentText
              // Each `answer` event is a whole citation-attributed fact
              // (see joinAnswerSegment's own doc comment) — when this
              // segment cites a different source than the last one, it's
              // a new fact, not a continuation of the same sentence, so
              // start a new paragraph rather than running it on with a
              // single space (the flat "wall of text" readability bug).
              const citationChanged =
                content.length > 0 && lastAnswerRef !== null && ref !== lastAnswerRef
              // rag-engine's AnswerSegmenter strips each segment's leading
              // whitespace, so a Markdown list ("- item one\n- item two")
              // arrives here as separate segments *without* the newline
              // that kept them on their own lines ("- item one", then
              // "- item two"). Reinsert it: a single newline continues the
              // same list, a blank line starts a new one (either because
              // this is the first item after non-list prose, or because
              // the backend hasn't sent a list item yet at all). The same
              // treatment applies when the marker itself is a standalone
              // segment (BARE_LIST_MARKER_RE) — observed live for ordered
              // lists ("1.", "Programme Rationale", "2.", ...). A bare
              // marker is appended with no trailing space, so it doesn't
              // yet look like a complete list item to endsWithListItemLine
              // — which is exactly what lets the item's text on the next
              // segment fall through to the plain default branch below and
              // pick up a single joining space from joinAnswerSegment, same
              // as any other two-clause join.
              const isListItem = LIST_MARKER_RE.test(segmentText) || BARE_LIST_MARKER_RE.test(segmentText)
              const alreadySeparated = /^\s*\n/.test(segmentText)
              // A *complete* blank line already at the start of the
              // segment (two-or-more newlines) — as opposed to a lone "\n"
              // — is the one case where the segment's own separator can be
              // trusted outright even when leaving a list block: CommonMark
              // only folds a *single* trailing newline into "lazy
              // continuation" of the previous list item, not a blank line.
              const alreadyBlankSeparated = /^\s*\n\s*\n/.test(segmentText)

              let delta: string
              if (content.length === 0) {
                delta = rawDelta
              } else if (isListItem) {
                // The backend already separated this segment itself —
                // joinAnswerSegment's own whitespace check already avoids
                // adding a stray space here, so don't inject another
                // separator on top of it.
                delta = alreadySeparated
                  ? rawDelta
                  : endsWithListItemLine(content)
                    ? `\n${rawDelta}`
                    : `\n\n${rawDelta}`
              } else if (endsWithListItemLine(content)) {
                // Leaving a list block for non-list prose needs a blank
                // line: without it, a bare join here reads to CommonMark
                // as a "lazy continuation" line and merges into the last
                // <li>. This still applies even when the segment carries
                // its own single leading newline — that lone "\n" IS the
                // lazy-continuation case, so it can't be trusted here the
                // way `isListItem`'s own separator can; only a segment
                // that already supplies a full blank line is left alone.
                delta = alreadyBlankSeparated ? rawDelta : `\n\n${rawDelta.replace(/^\s*\n+\s*/, '')}`
              } else if (citationChanged && !isSentenceContinuation(content, segmentText)) {
                // A genuinely new fact outside a list starts a new
                // paragraph, but a segment that already brought its own
                // separator (even a single newline — no list to lazily
                // continue here) is left as the backend shaped it. A
                // segment that merely continues the sentence the citation
                // change split mid-way through (see isSentenceContinuation)
                // never starts a new paragraph, citation change or not.
                delta = alreadySeparated ? rawDelta : `\n\n${rawDelta}`
              } else {
                delta = rawDelta
              }

              const joined = joinAnswerSegment(content, delta)
              const appended = joined.slice(content.length)
              content = joined
              lastAnswerRef = ref
              if (appended) callbacks.onAnswer?.(appended)
            }
            break
          }
          case 'message': {
            if (!dispatchNestedMessageEvent(data, callbacks)) {
              const delta = extractAnswerDelta(data)
              if (delta) {
                const merged = appendStreamDelta(content, delta)
                const appended = merged.slice(content.length)
                content = merged
                if (appended) callbacks.onAnswer?.(appended)
              }
            }
            break
          }
          case 'citation': {
            if (abstained) break
            const batch = parseCitationEvent(data)
            if (batch.length > 0) {
              citations = mergeCitations(citations, batch)
              callbacks.onCitations?.(batch)
            }
            break
          }
          case 'abstention': {
            abstained = true
            citations = []
            const obj = asRecord(data)
            const reason = obj ? readString(obj, 'reason') : undefined
            const abstentionMessage = obj ? readString(obj, 'message') : undefined
            callbacks.onAbstention?.({ reason, message: abstentionMessage })
            break
          }
          case 'done': {
            terminalEvent = true
            const obj = asRecord(data)
            durationMs = obj ? readNumber(obj, 'duration_ms') : undefined
            messageId = obj ? readString(obj, 'message_id') : undefined
            // Mechanism B (the streaming post-generation absence-assertion
            // check, `is_absence_assertion` in rag-engine) has no dedicated
            // SSE event of its own — unlike Mechanism A's `abstention`
            // event (handled above), it only learns the answer was a
            // decline *after* every `citation`/`answer` segment has
            // already streamed, so the engine flags it on the terminal
            // `done` event instead (`abstained`/`abstain_reason`, additive
            // fields — absent on an older engine that predates this).
            // Applying the exact same treatment `case 'abstention'` uses
            // (drop already-streamed citations, fire `onAbstention`) makes
            // the rest of the pipeline — `AppLayout`'s `abstainedRef`,
            // the cleared `sources`, the persisted `ChatMessage.abstained`
            // — handle this path identically, with no new UI logic. The
            // `!abstained` guard keeps this a no-op when an `abstention`
            // event already fired for this stream (sticky, same as the
            // 'citation' case's own guard above).
            if (obj?.abstained === true && !abstained) {
              abstained = true
              citations = []
              callbacks.onAbstention?.({
                reason: readString(obj, 'abstain_reason'),
              })
            }
            // `final_answer` (additive field, absent on an older engine):
            // the engine's post-generation answer-normalisation pass can
            // rewrite the streamed text — e.g. trimming a duplicated
            // trailing sentence or fixing spacing — after every `answer`
            // segment has already streamed and been shown live via
            // `onAnswer`. `content` (not a callback) is what actually
            // becomes the message once this stream finishes: `sendMessage`
            // returns it as `content`, and the caller builds the final,
            // persisted `ChatMessage` straight from that return value
            // rather than from the accumulated `onAnswer` deltas — so
            // swapping it in here, once, is what "replaces the rendered
            // message content" for every caller, with no per-caller
            // wiring. Only applied when it's a real, different answer;
            // an empty string or a value matching what was already
            // assembled is left alone (nothing to replace). Compared and
            // gated on the *trimmed* value (review fix): an untrimmed
            // `finalAnswer` is truthy for a whitespace-only string
            // ("   "), which would otherwise overwrite a perfectly good
            // streamed answer with a blank bubble — `content` itself is
            // still assigned untrimmed (a real answer's own meaningful
            // leading/trailing whitespace, if any, is preserved).
            const finalAnswer = obj ? readString(obj, 'final_answer') : undefined
            const trimmedFinalAnswer = finalAnswer?.trim()
            if (trimmedFinalAnswer && trimmedFinalAnswer !== content.trim()) {
              content = finalAnswer as string
            }
            callbacks.onDone?.({ duration_ms: durationMs })
            // Terminal: tell consumeSseStream to stop reading here rather
            // than wait for the server to close the socket.
            return true
          }
          case 'error': {
            terminalEvent = true
            streamError = extractErrorMessage(data)
            callbacks.onError?.(streamError)
            return true
          }
          default:
            dispatchNestedMessageEvent(data, callbacks)
            break
        }
      },
      signal,
    )
  } catch (err) {
    if (signal?.aborted) throw err
    const message = toFriendlyStreamError(err)
    callbacks.onError?.(message)
    throw new Error(message)
  }

  if (!terminalEvent && !signal?.aborted) {
    callbacks.onError?.(QUERY_INCOMPLETE_ERROR)
    throw new Error(QUERY_INCOMPLETE_ERROR)
  }

  if (streamError) {
    throw new Error(streamError)
  }

  return { content, citations, coverage, durationMs, messageId }
}

/** SSE query — streams answer tokens and returns final message shape. */
export async function sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
  const startedAt = Date.now()
  const payload: QueryRequest = {
    question: request.message,
    ...(request.omitDocuments ? {} : { documents: request.documents }),
    ...(request.tier ? { tier: request.tier } : {}),
    ...(request.chatId ? { conversation_id: request.chatId } : {}),
  }

  const { content, citations, coverage, durationMs, messageId } = await streamQuery(
    payload,
    request.callbacks ?? {},
    request.signal,
  )

  const thinkingSeconds =
    durationMs != null && durationMs > 0
      ? Math.max(1, Math.round(durationMs / 1000))
      : Math.max(1, Math.round((Date.now() - startedAt) / 1000))

  return {
    messageId: messageId ?? crypto.randomUUID(),
    content,
    fileTags: citations.length > 0 ? citationsToTags(citations) : undefined,
    sources: citations.length > 0 ? citationsToSources(citations) : undefined,
    thinkingSeconds,
    coverage,
  }
}
