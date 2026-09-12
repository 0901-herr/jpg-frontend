import type { Citation } from '../api/types/query'
import type { Source } from '../types'

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

export function displayFilename(raw: string): string {
  const stripped = raw.replace(/^[0-9a-f]{8}_(?:\d+_v\d+_)?/i, '')
  return stripped || raw
}

export function parseCitationObject(data: unknown): Citation | null {
  const obj = asRecord(data)
  if (!obj) return null

  const page = readNumber(obj, 'page') ?? readNumber(obj, 'page_number')
  const docRef = readString(obj, 'doc_ref') ?? readString(obj, 'source_doc_ref') ?? ''

  return {
    doc_ref: docRef,
    page,
    page_number: page,
    snippet: readString(obj, 'snippet'),
    score: readNumber(obj, 'score'),
    document_id: readString(obj, 'document_id'),
    filename: readString(obj, 'filename'),
    url: readString(obj, 'url'),
    item_id: readString(obj, 'item_id'),
    chunk_id: readString(obj, 'chunk_id'),
    source_doc_ref: readString(obj, 'source_doc_ref'),
  }
}

/** Parse SSE citation event — single citation or `{ citations: [...] }`. */
export function parseCitationEvent(data: unknown): Citation[] {
  const obj = asRecord(data)
  if (!obj) {
    const single = parseCitationObject(data)
    return single ? [single] : []
  }

  const batch = obj.citations
  if (Array.isArray(batch)) {
    return batch.map(parseCitationObject).filter((c): c is Citation => c != null)
  }

  const single = parseCitationObject(obj)
  return single ? [single] : []
}

export function citationLabel(citation: Citation): string {
  if (citation.filename) return displayFilename(citation.filename)
  if (citation.doc_ref) return citation.doc_ref
  if (citation.document_id) return `Document ${citation.document_id}`
  return 'Source'
}

export function citationKey(citation: Citation): string {
  return [
    citation.document_id ?? '',
    citation.doc_ref,
    citation.page ?? citation.page_number ?? '',
    citation.item_id ?? '',
  ].join(':')
}

export function mergeCitations(existing: Citation[], incoming: Citation[]): Citation[] {
  const map = new Map<string, Citation>()
  for (const c of existing) map.set(citationKey(c), c)
  for (const c of incoming) map.set(citationKey(c), c)
  return [...map.values()]
}

export function mapCitationToSource(citation: Citation, index: number): Source {
  const page = citation.page ?? citation.page_number
  return {
    index,
    filename: citationLabel(citation),
    documentId: citation.document_id,
    docRef: citation.doc_ref || undefined,
    page,
    url: citation.url,
    snippet: citation.snippet,
    reference: page != null ? `Page ${page}` : undefined,
  }
}

export function citationsToSources(citations: Citation[]): Source[] {
  return citations.map((citation, i) => mapCitationToSource(citation, i + 1))
}

/** Friendly inline citation label, e.g. "(Report.pdf, Page 22)" — replaces
 * the raw [DocN] marker, which means nothing to a user reading the answer. */
export function citationDisplayLabel(source: Source): string {
  const detail = source.reference ? `, ${source.reference}` : ''
  return `(${source.filename}${detail})`
}

export function citationsToTags(citations: Citation[]): string[] {
  const labels = [...new Set(citations.map(citationLabel).filter(Boolean))]
  if (labels.length <= 1) return labels
  return [labels[0], `+${labels.length - 1}`]
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Split answer text into segments, marking doc_ref tokens for linking. */
export function splitAnswerByDocRefs(
  content: string,
  sources: Source[],
): Array<{ type: 'text'; value: string } | { type: 'ref'; value: string; source: Source }> {
  const refs = sources.filter((s) => s.docRef && (s.url || s.documentId))
  if (refs.length === 0 || !content) {
    return [{ type: 'text', value: content }]
  }

  const byRef = new Map(refs.map((s) => [s.docRef!, s]))
  const pattern = [...byRef.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')

  if (!pattern) return [{ type: 'text', value: content }]

  const parts = content.split(new RegExp(`(${pattern})`, 'g'))
  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const source = byRef.get(part)
      if (source) return { type: 'ref' as const, value: part, source }
      return { type: 'text' as const, value: part }
    })
}
