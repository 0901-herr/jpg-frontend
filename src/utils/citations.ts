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

/** Assigns a stable, 1-based number to each distinct `(document_id, page)`
 * pair *as it is first cited in the answer text itself* — i.e. walking
 * `content` left to right via `splitAnswerByDocRefs` (which already
 * resolves bracket groups and dedupes back-to-back markers) rather than
 * numbering by the backend's SOURCE-LIST order. A source the answer never
 * quotes gets no entry at all — "uncited" isn't "the last number", it's
 * absent. A repeated marker for the same `(document_id, page)` (including
 * two occurrences inside one bracket group, e.g. `[Doc6, Doc7, Doc6]`)
 * reuses the number from its first appearance rather than taking a new
 * one, since a `Map.has` check guards every assignment.
 *
 * Both the inline pill (`CitationLink`, via `markdownRenderers.tsx`) and
 * the "Related documents" page chips (`CitationList`) call this over the
 * same message's `content` + `sources` so a reader can map a pill's digit
 * straight to its list entry, and so the second question in a chat starts
 * back at 1 instead of continuing the first question's count (each
 * message's own `content` is scoped to that message only). */
export function numberCitationsByAnswerOrder(content: string, sources: Source[]): Map<string, number> {
  const numbers = new Map<string, number>()
  let next = 1
  for (const segment of splitAnswerByDocRefs(content, sources)) {
    if (segment.type !== 'ref') continue
    const key = citationNumberKey(segment.source)
    if (!numbers.has(key)) {
      numbers.set(key, next)
      next += 1
    }
  }
  return numbers
}

/** Splits raw answer Markdown into "clauses" — one per sentence inside a
 * paragraph, or one per whole list-item line — the unit `citationContextByAnswerOrder`
 * treats as "the answer sentence or list item that carries this pill".
 * A list-item line (`- …`, `* …`, `1. …`) is kept whole rather than
 * sentence-split, since a short bullet reads as one unit even with an
 * internal period ("Approved by J. Tan."). */
function splitIntoAnswerClauses(content: string): string[] {
  return content
    .split(/\n+/)
    .flatMap((line) => (/^\s*(?:[-*]|\d+\.)\s+/.test(line) ? [line] : line.split(/(?<=[.!?])\s+/)))
    .map((clause) => clause.trim())
    .filter(Boolean)
}

/** Strips a leading list-marker (`- `, `* `, `1. `) and collapses the
 * whitespace `splitAnswerByDocRefs` leaves behind once its `ref` segments
 * are removed (e.g. a trailing space before a period from "point [Doc1]."
 * becoming "point .") into normal prose spacing, then truncates to ~140
 * chars on a word boundary with an ellipsis. */
function cleanClauseText(text: string): string {
  const cleaned = text
    .replace(/^\s*(?:[-*]|\d+\.)\s+/, '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= 140) return cleaned
  return `${cleaned.slice(0, 139).trimEnd()}…`
}

/** Maps each cited `(document_id, page)` key to the answer sentence / list
 * item that first cites it — the text `CitationList` shows as `Cited for:
 * "…"` under that entry, so a reader can see *why* a document made the
 * list instead of only that it did. Walks the same clauses
 * `numberCitationsByAnswerOrder` would number, in order, and keeps only
 * the first clause seen for each key (matching that function's
 * first-appearance numbering). */
export function citationContextByAnswerOrder(content: string, sources: Source[]): Map<string, string> {
  const contexts = new Map<string, string>()
  for (const clause of splitIntoAnswerClauses(content)) {
    const segments = splitAnswerByDocRefs(clause, sources)
    const refs = segments.filter((s): s is Extract<typeof s, { type: 'ref' }> => s.type === 'ref')
    if (refs.length === 0) continue

    const text = cleanClauseText(
      segments
        .filter((s) => s.type === 'text')
        .map((s) => s.value)
        .join(''),
    )
    for (const ref of refs) {
      const key = citationNumberKey(ref.source)
      if (!contexts.has(key)) contexts.set(key, text)
    }
  }
  return contexts
}

/** Grammatical function words excluded from question-word highlighting
 * even when they happen to be ≥ 4 letters (e.g. "with", "about") — only
 * content words like "students" or "lecturer" should stand out in a
 * snippet, since those are what actually distinguish one document's
 * relevance from another's. */
const QUESTION_STOP_WORDS = new Set([
  'this', 'that', 'these', 'those', 'with', 'from', 'have', 'has', 'had',
  'were', 'was', 'will', 'would', 'could', 'should', 'your', 'about',
  'which', 'their', 'there', 'when', 'where', 'what', 'who', 'whom',
  'whose', 'than', 'then', 'them', 'they', 'into', 'such', 'some', 'each',
  'every', 'only', 'also', 'just', 'very', 'more', 'most', 'much', 'many',
  'while', 'being', 'been', 'does', 'doing', 'done', 'over', 'under',
  'again', 'further', 'once', 'here', 'both', 'other', 'same', 'because',
  'before', 'after', 'above', 'below', 'between', 'through', 'during',
  'like', 'want', 'need', 'please', 'tell', 'know', 'give',
])

/** The set of "significant" words in a user question — lowercased, ≥ 4
 * letters, stop-words removed — used to highlight a citation snippet's
 * matching words so a reader can see at a glance which part of the
 * snippet actually answers the question, rather than skimming the whole
 * thing (client feedback: a snippet about "the lecturer" reads as
 * irrelevant when the question asked about "the students"). */
export function significantQuestionWords(question: string): Set<string> {
  const words = question.toLowerCase().match(/[a-z0-9']+/g) ?? []
  return new Set(words.filter((word) => word.length >= 4 && !QUESTION_STOP_WORDS.has(word)))
}

export interface HighlightSegment {
  text: string
  highlight: boolean
}

/** Splits `text` into segments, flagging each word that matches a
 * significant word from `question` (see `significantQuestionWords`) so
 * the caller can render those words bolder than the rest of the snippet.
 * Punctuation and whitespace are preserved verbatim as non-highlighted
 * segments; matching is case-insensitive and whole-word only, so
 * "lecture" in the question never highlights "lecturer" in a snippet. */
export function highlightSignificantWords(text: string, question: string): HighlightSegment[] {
  if (!text) return []
  const words = significantQuestionWords(question)
  if (words.size === 0) return [{ text, highlight: false }]

  return text
    .split(/(\b[a-zA-Z0-9']+\b)/g)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, highlight: words.has(part.toLowerCase()) }))
}
