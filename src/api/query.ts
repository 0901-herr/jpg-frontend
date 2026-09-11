import { apiPostStream, consumeSseStream } from './http'
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
): Promise<{ content: string; citations: Citation[]; coverage?: CoverageEvent; durationMs?: number }> {
  const { response, coverageFromHeaders } = await apiPostStream('/query', payload, true, signal)

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
  let citations: Citation[] = []
  let coverage: CoverageEvent | undefined
  let durationMs: number | undefined
  let streamError: string | null = null
  let terminalEvent = false

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
            if (stage) callbacks.onProgress?.(stage)
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
          case 'answer': {
            const segmentText = extractAnswerDelta(data)
            if (segmentText) {
              const ref = citationRefForSegment(data, citations)
              const rawDelta = ref ? joinAnswerSegment(segmentText, ref) : segmentText
              const joined = joinAnswerSegment(content, rawDelta)
              const delta = joined.slice(content.length)
              content = joined
              callbacks.onAnswer?.(delta)
            }
            break
          }
          case 'citation': {
            const batch = parseCitationEvent(data)
            if (batch.length > 0) {
              citations = mergeCitations(citations, batch)
              callbacks.onCitations?.(batch)
            }
            break
          }
          case 'done': {
            terminalEvent = true
            const obj = asRecord(data)
            durationMs = obj ? readNumber(obj, 'duration_ms') : undefined
            callbacks.onDone?.({ duration_ms: durationMs })
            break
          }
          case 'error': {
            terminalEvent = true
            streamError = extractErrorMessage(data)
            callbacks.onError?.(streamError)
            break
          }
          default:
            break
        }
      },
      signal,
    )
  } catch (err) {
    if (signal?.aborted) throw err
    const message = toUserFacingQueryError(
      err instanceof Error ? err.message : undefined,
    )
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

  return { content, citations, coverage, durationMs }
}

/** SSE query — streams answer tokens and returns final message shape. */
export async function sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
  const startedAt = Date.now()
  const payload: QueryRequest = {
    question: request.message,
    documents: request.documents,
  }

  const { content, citations, coverage, durationMs } = await streamQuery(
    payload,
    request.callbacks ?? {},
    request.signal,
  )

  const thinkingSeconds =
    durationMs != null && durationMs > 0
      ? Math.max(1, Math.round(durationMs / 1000))
      : Math.max(1, Math.round((Date.now() - startedAt) / 1000))

  return {
    messageId: crypto.randomUUID(),
    content,
    fileTags: citations.length > 0 ? citationsToTags(citations) : undefined,
    sources: citations.length > 0 ? citationsToSources(citations) : undefined,
    thinkingSeconds,
    coverage,
  }
}
