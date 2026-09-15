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

/** Groups a `Source` by the same `(document_id, page)` identity used for
 * citation numbering — falls back to `filename` when `documentId` is
 * absent, matching `groupSourcesByDocument`'s document-identity fallback,
 * so a source with no `documentId` still numbers consistently across the
 * inline pill and the "Related documents" page chip that both cite it. */
export function citationNumberKey(source: Source): string {
  return `${source.documentId ?? source.filename}:${source.page ?? ''}`
}

/** Assigns a stable, 1-based number to each distinct `(document_id, page)`
 * pair in `sources`, in order of first appearance — a citation that repeats
 * later in the same message (the same page cited more than once) reuses
 * its earlier number rather than taking a new one. Both the inline pill
 * (`CitationLink`, via `markdownRenderers.tsx`) and the "Related documents"
 * page chips (`CitationList`) call this over the same message's `sources`
 * array so a reader can map a pill's digit straight to its list entry. */
export function numberCitations(sources: Source[]): Map<string, number> {
  const numbers = new Map<string, number>()
  let next = 1
  for (const source of sources) {
    const key = citationNumberKey(source)
    if (!numbers.has(key)) {
      numbers.set(key, next)
      next += 1
    }
  }
  return numbers
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

/** Matches a single `[DocN]`-shaped bracket group, one or more entries
 * (comma-separated), each an optional-space "Doc" + either a number or the
 * literal letter "N" — the model sometimes copies the prompt's own
 * `[DocN]` placeholder verbatim instead of filling in a real number — with
 * an optional ":page" hint the model sometimes tacks on — everything from
 * a lone `[Doc3]` up to a raw multi-doc list like `[Doc1, Doc2, Doc6]`,
 * `[Doc1:2, Doc3]`, or a placeholder entry like `[DocN]` / `[Doc1, DocN]`.
 * Case-insensitive since the model doesn't always capitalize "Doc"
 * consistently. `DOC_ENTRY_RE` below stays digits-only, so a `DocN` entry
 * never resolves to a source and is dropped exactly like an unmatched
 * number. */
const BRACKET_DOC_GROUP_RE =
  /\[\s*doc\s*(?:\d+|n)(?:\s*:\s*\d+)?\s*(?:,\s*doc\s*(?:\d+|n)(?:\s*:\s*\d+)?\s*)*\]/gi
const DOC_ENTRY_RE = /^doc\s*(\d+)(?:\s*:\s*\d+)?$/i

/**
 * rag-engine only strips single, well-formed `[DocN]` markers from the raw
 * model output — it doesn't recognise (and so doesn't strip) a
 * comma-separated multi-doc marker the model sometimes writes instead
 * (`[Doc1, Doc2, Doc6]`), which otherwise reaches the screen as raw
 * bracket text. This expands every such bracket group — including a
 * "list" of just one entry, and two markers written back-to-back with no
 * comma (`[Doc1][Doc3]`, matched as two separate one-entry groups) — into
 * one canonical `[DocN]` token per entry that actually has a matching
 * source, so the existing per-ref split below turns each into its own
 * citation. An entry with no matching source is dropped silently; if a
 * whole group resolves to nothing, the group disappears rather than ever
 * showing raw, meaningless "[Doc…]" text. */
function expandBracketDocGroups(content: string, byRef: Map<string, Source>): string {
  return content.replace(BRACKET_DOC_GROUP_RE, (match) => {
    const resolved = match
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.trim())
      .map((entry) => {
        const docMatch = DOC_ENTRY_RE.exec(entry)
        if (!docMatch) return null
        const ref = `[Doc${docMatch[1]}]`
        return byRef.has(ref) ? ref : null
      })
      .filter((ref): ref is string => ref != null)
    return resolved.join('')
  })
}

type AnswerSegment =
  | { type: 'text'; value: string }
  | { type: 'ref'; value: string; source: Source }

/** Inserts a plain space between two `ref` segments that ended up directly
 * adjacent with nothing between them — the shape produced by
 * `expandBracketDocGroups` turning "[Doc1, Doc2]" into the back-to-back
 * tokens "[Doc1][Doc2]", and by the model itself sometimes writing
 * consecutive markers the same way. Without it, two citation pills would
 * render glued together with no gap. */
function spaceAdjacentRefs(parts: AnswerSegment[]): AnswerSegment[] {
  const result: AnswerSegment[] = []
  for (const part of parts) {
    if (part.type === 'ref' && result[result.length - 1]?.type === 'ref') {
      result.push({ type: 'text', value: ' ' })
    }
    result.push(part)
  }
  return result
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
  const expandedContent = expandBracketDocGroups(content, byRef)
  const pattern = [...byRef.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')

  if (!pattern) return [{ type: 'text', value: expandedContent }]

  const parts = expandedContent.split(new RegExp(`(${pattern})`, 'g'))
  const segments = parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const source = byRef.get(part)
      if (source) return { type: 'ref' as const, value: part, source }
      return { type: 'text' as const, value: part }
    })
  return spaceAdjacentRefs(segments)
}

/** True iff `content` quotes at least one of `sources` inline — i.e.
 * `splitAnswerByDocRefs` produces at least one `ref` segment. Used to
 * decide whether a completed answer earns a "Related documents" list: an
 * answer that names no source inline (a refusal, or one where every marker
 * turned out to be unresolvable, like a stray `[DocN]` placeholder)
 * shouldn't claim to quote documents it never actually cited. */
export function answerHasInlineCitation(content: string, sources: Source[]): boolean {
  return splitAnswerByDocRefs(content, sources).some((segment) => segment.type === 'ref')
}
