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

function extractErrorMessage(data: unknown): string {
  const obj = asRecord(data)
  if (!obj) return typeof data === 'string' ? data : 'Query failed'
  return readString(obj, 'message') ?? readString(obj, 'detail') ?? readString(obj, 'error') ?? 'Query failed'
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

  await consumeSseStream(
    response,
    ({ event, data }) => {
      switch (event) {
        case 'coverage': {
          coverage = parseCoverage(data)
          callbacks.onCoverage?.(coverage)
          break
        }
        case 'answer': {
          const delta = extractAnswerDelta(data)
          if (delta) {
            content += delta
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
          const obj = asRecord(data)
          durationMs = obj ? readNumber(obj, 'duration_ms') : undefined
          callbacks.onDone?.({ duration_ms: durationMs })
          break
        }
        case 'error': {
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
