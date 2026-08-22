import { apiPost } from './http'
import type { Citation, QueryRequest, QueryResponse, SendMessageRequest, SendMessageResponse } from './types/query'

/** Strip upload prefixes like `15c0450f_` or `58adf698_277631_v2_`. */
function displayFilename(raw: string): string {
  const stripped = raw.replace(/^[0-9a-f]{8}_(?:\d+_v\d+_)?/i, '')
  return stripped || raw
}

function citationLabel(citation: Citation): string {
  if (citation.filename) return displayFilename(citation.filename)
  if (citation.source_doc_ref) return citation.source_doc_ref
  return citation.doc_ref
}

function mapCitationsToSources(citations: QueryResponse['citations']) {
  return citations.map((citation, index) => ({
    index: index + 1,
    filename: citationLabel(citation),
    reference: citation.page_number ? `Page ${citation.page_number}` : undefined,
  }))
}

function mapCitationsToTags(citations: QueryResponse['citations']): string[] {
  const labels = [...new Set(citations.map(citationLabel).filter(Boolean))]
  if (labels.length <= 1) return labels
  return [labels[0], `+${labels.length - 1}`]
}

function mapDurationToSeconds(durationMs: number | undefined): number | undefined {
  if (durationMs == null || durationMs <= 0) return undefined
  return Math.max(1, Math.round(durationMs / 1000))
}

/** Non-streaming query — maps backend response to chat message shape. */
export async function sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
  const payload: QueryRequest = {
    query: request.message,
    session_id: request.sessionId ?? request.chatId,
    accuracy_tier: 'fast',
    filters: request.documentId ? { doc_id: request.documentId } : undefined,
  }

  const response = await apiPost<QueryResponse>('/query/sync', payload, true, request.signal)
  const citations = response.citations ?? []

  return {
    messageId: crypto.randomUUID(),
    content: response.answer,
    fileTags: citations.length > 0 ? mapCitationsToTags(citations) : undefined,
    sources: citations.length > 0 ? mapCitationsToSources(citations) : undefined,
    thinkingSeconds: mapDurationToSeconds(response.duration_ms),
  }
}

export async function querySync(payload: QueryRequest): Promise<QueryResponse> {
  return apiPost<QueryResponse>('/query/sync', payload)
}
