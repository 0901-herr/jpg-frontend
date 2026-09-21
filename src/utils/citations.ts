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

/** Trims a citation snippet and drops exactly one trailing ellipsis (either
 * the ASCII "..." or the single-character "…"), matched only after
 * trimming and only at the very end — a dot elsewhere in the snippet (an
 * abbreviation, a decimal) is left untouched. The engine truncates each
 * `snippet` to a char limit and appends this itself (being fixed at the
 * source in rag-engine), but a session already persisted in localStorage
 * keeps the old value, so this runs at the parse boundary rather than
 * relying on the engine fix alone. A snippet that's nothing but the
 * ellipsis normalises to an empty string, which `CitationList` already
 * treats as "no excerpt" via its `group.snippet` truthiness guard. */
function normalizeSnippet(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  return raw.trim().replace(/(?:\.\.\.|…)$/, '')
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
    snippet: normalizeSnippet(readString(obj, 'snippet')),
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
 * showing raw, meaningless "[Doc…]" text.
 *
 * A repeated entry *within the same group* — the model writing
 * `[Doc6, Doc7, Doc6, Doc8]` — resolves to the same underlying citation
 * twice; expanding it verbatim would render that citation as two separate
 * pills side by side (fix round 1: verified empirically, pill sequence
 * came out `1, 2, 1, 3` instead of `1, 2, 3`). The dedupe below is scoped
 * to one `.replace` callback invocation — i.e. one bracket occurrence — so
 * it only collapses a repeat *inside that one group*; the same citation
 * can still earn its own pill again later if the model cites it in a
 * different bracket group or as a lone marker elsewhere in the answer. */
function expandBracketDocGroups(content: string, byRef: Map<string, Source>): string {
  return content.replace(BRACKET_DOC_GROUP_RE, (match) => {
    const seenInGroup = new Set<string>()
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
      .filter((ref) => {
        // Dedupe by the citation's own resolved identity, not by the
        // literal marker text — a repeated marker resolves to the same
        // `(document_id, page)` and so must collapse to one pill.
        const key = citationNumberKey(byRef.get(ref)!)
        if (seenInGroup.has(key)) return false
        seenInGroup.add(key)
        return true
      })
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

/** Text that can appear only as a *connector* between two markers inside one
 * citation run: any combination of whitespace and the separators `,` `;`
 * `&` `/` and the word "and" (case-insensitive — the model doesn't always
 * capitalize it, though it never needs to mid-sentence). Anything else in
 * the text between two refs — including a comma followed by real prose,
 * not just another marker — means the run has ended; a run is never
 * inferred from two markers that just happen to be nearby, only from
 * markers the model wrote back-to-back with nothing but these connectors
 * between them. This is also what keeps plain prose safe: "cats and dogs"
 * has no `ref` segments on either side of "and" at all, so it's never
 * examined as a possible run boundary in the first place. */
const RUN_CONNECTOR_RE = /^(?:\s+|[,;&/]|and)*$/i

/** Optional whitespace then one sentence-ending mark, anchored to the start
 * of the text right after a citation run. */
const RUN_TRAILING_PUNCTUATION_RE = /^(\s*)([.!?])/

/** An optional trailing `,`/`;` plus any whitespace up to the very end of
 * the text right before a citation run — stripped only together with a
 * detected trailing sentence mark (see `collapseCitationRuns`), never on
 * its own. The comma/semicolon itself is optional so plain trailing
 * whitespace with no comma ("per " before "[Doc1] & [Doc2].") still gets
 * trimmed — otherwise the moved-in period would land one space after the
 * preceding word ("per .") instead of directly against it ("per."). */
const RUN_LEADING_COMMA_RE = /[,;]?\s*$/

type RefSegment = Extract<AnswerSegment, { type: 'ref' }>

/**
 * Collapses a "citation run" — one or more `ref` segments separated only by
 * whitespace and/or `,` `;` `and` `&` `/` (`RUN_CONNECTOR_RE`) — into a
 * single space-separated sequence of pills with no separator text between
 * them, deduplicated by `citationNumberKey` (the same document+page
 * identity `expandBracketDocGroups` already dedupes *within* one bracket
 * group by — this extends that across an *, and* / comma-joined chain of
 * separate groups and lone markers too, e.g. "[Doc1, Doc2], [Doc3] and
 * [Doc1]" → pills 1, 2, 3, the trailing repeat of Doc1 dropped).
 *
 * A run of 2+ markers that's immediately followed by sentence-ending
 * punctuation (optionally after whitespace) also has that punctuation
 * moved to immediately before the run, with a `,`/`;` immediately before
 * the run dropped at the same time — "actions, [Doc5], [Doc6]." would
 * otherwise read as "actions, 5, 6." with the period stranded after the
 * last pill instead of ending the sentence. Gated to *runs of 2+* rather
 * than every single citation: a lone "[Doc1]." at the end of an ordinary
 * sentence is the overwhelmingly common case across every answer and has
 * its own existing, unremarkable rendering ("text 1." reads fine) that the
 * client never flagged — only adjacent multi-marker runs ("1 , 2 , 3 . 4")
 * were reported as broken, and this keeps the fix scoped to that. A run
 * with nothing (or non-punctuation text) after it is left exactly where it
 * was, comma included.
 *
 * Never changes `numberCitationsByAnswerOrder`: dropping a duplicate ref
 * here never changes which key is numbered first, since a duplicate never
 * earned its own number to begin with (that function's own `Map.has`
 * guard) — only which/how many segments render, not the numbering.
 */
function collapseCitationRuns(segments: AnswerSegment[]): AnswerSegment[] {
  const result: AnswerSegment[] = []
  let i = 0

  while (i < segments.length) {
    const segment = segments[i]
    if (segment.type !== 'ref') {
      result.push(segment)
      i += 1
      continue
    }

    // Extend the run through every following (connector-text, ref) pair.
    let end = i
    while (end + 2 < segments.length) {
      const connector = segments[end + 1]
      const nextRef = segments[end + 2]
      if (connector.type !== 'text' || nextRef.type !== 'ref') break
      if (!RUN_CONNECTOR_RE.test(connector.value)) break
      end += 2
    }

    const runRefs = segments
      .slice(i, end + 1)
      .filter((s): s is RefSegment => s.type === 'ref')
    const seen = new Set<string>()
    const dedupedRefs = runRefs.filter((ref) => {
      const key = citationNumberKey(ref.source)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const before = result[result.length - 1]
    const after = segments[end + 1]
    // Moving the run's sentence punctuation to before the run needs an
    // actual preceding text segment to attach it to. `splitAnswerByDocRefs`
    // is called per Markdown text node (once per paragraph, table cell,
    // list item, or the text after an inline `<strong>`/link boundary —
    // see `linkifyNode`), so a run can legitimately be the very first thing
    // in the string it's handed, with no `before` segment at all. Without
    // this guard the mark got pushed as a new leading segment of its own —
    // a bare "." with nothing in front of it. When there's no predecessor
    // to attach to, skip the move entirely and leave the punctuation
    // exactly where it was, after the run.
    const punctuationMatch =
      runRefs.length >= 2 && before?.type === 'text' && after?.type === 'text'
        ? RUN_TRAILING_PUNCTUATION_RE.exec(after.value)
        : null

    if (punctuationMatch) {
      const [full, , mark] = punctuationMatch
      result[result.length - 1] = {
        type: 'text',
        value: before.value.replace(RUN_LEADING_COMMA_RE, '') + mark,
      }
      result.push({ type: 'text', value: ' ' })
      dedupedRefs.forEach((ref, idx) => {
        if (idx > 0) result.push({ type: 'text', value: ' ' })
        result.push(ref)
      })
      const remainder = after.value.slice(full.length)
      if (remainder) result.push({ type: 'text', value: remainder })
      i = end + 2
      continue
    }

    dedupedRefs.forEach((ref, idx) => {
      if (idx > 0) result.push({ type: 'text', value: ' ' })
      result.push(ref)
    })
    i = end + 1
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
  return collapseCitationRuns(spaceAdjacentRefs(segments))
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

/** Deterministically deletes every `[DocN]`-shaped marker (reusing
 * `BRACKET_DOC_GROUP_RE`, the same pattern `expandBracketDocGroups` already
 * matches) from an abstained message's text — call only when
 * `message.abstained` is true.
 *
 * Citations are already cleared for an abstained message (`AppLayout`'s
 * `onAbstention` handler, `streamQuery`'s own `abstained` handling), so a
 * leftover marker the model wrote into its decline sentence — despite the
 * prompt asking it not to cite a refusal — would otherwise reach the
 * screen as a bare, meaningless "[Doc1]" (no source resolves for
 * `splitAnswerByDocRefs` to turn it into a pill once `sources` is empty).
 * This is a pure, fixed-pattern deletion of unambiguous marker syntax —
 * never a rewrite or splice of the surrounding text — the same safety
 * class as the other anchored strips in this codebase (see the F54
 * lesson: a rewrite that invents replacement text is fragile against the
 * common case it wasn't designed for; a deletion of a token that has
 * exactly one meaning is not). */
export function stripAbstainedCitationMarkers(content: string): string {
  return content
    .replace(BRACKET_DOC_GROUP_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/^[ \t]+/gm, '')
    .trim()
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

/** Unicode General Category P (Punctuation) and S (Symbol) — the boundary
 * class CommonMark's emphasis-flanking rule treats as "not a word
 * character" alongside whitespace. Category P alone misses ASCII marks
 * like `+ = < > ^ \` | ~`, which CommonMark also counts as punctuation for
 * this purpose, so both categories are included. */
const FLANK_BOUNDARY_CLASS = '[\\s\\p{P}\\p{S}]'

/** Builds a regex that strips a single-character emphasis span for
 * `marker` (`*` or `_`) — but only where both delimiters satisfy a
 * CommonMark-lite left/right-flanking rule: the opener sits at a word
 * boundary (start-of-string, or preceded by whitespace/punctuation) and
 * is immediately followed by a non-space character; the closer is
 * immediately preceded by a non-space character and followed by a word
 * boundary (end-of-string, or whitespace/punctuation). Fixes round-1
 * review finding: the naive "any bare marker...any bare marker" version
 * paired up the nearest two bare markers in a clause regardless of what
 * sat between
 * them, so an ordinary character used twice in the same clause — "3*4 …
 * 5*6", "my_file_name.pdf" (two underscores, each between word
 * characters) — got misread as one emphasis span and silently deleted
 * along with everything between. Under this rule neither marker in those
 * examples is a valid opener or closer (each sits directly against a
 * letter or digit, which is neither whitespace nor punctuation, on the
 * "wrong" side), so the regex simply never matches there — real emphasis
 * like "*critical*" or "_critical_", flanked by whitespace on both sides,
 * still matches and strips normally. */
function makeSingleCharEmphasisRegex(marker: '*' | '_'): RegExp {
  const m = marker === '*' ? '\\*' : '_'
  return new RegExp(
    `(?<=^|${FLANK_BOUNDARY_CLASS})${m}(?=\\S)([^${m}\\n]*?\\S)${m}(?=$|${FLANK_BOUNDARY_CLASS})`,
    'gu',
  )
}

const STAR_EMPHASIS_RE = makeSingleCharEmphasisRegex('*')
const UNDERSCORE_EMPHASIS_RE = makeSingleCharEmphasisRegex('_')

/** Strips inline Markdown markup so a "Cited for" clause reads as plain
 * prose instead of carrying the answer's raw formatting (client feedback:
 * the answer was a Markdown list/table and the cited clause showed its
 * inline markup verbatim, e.g. `Cited for: "**15 June 2026**: 5
 * attendees"`) — a leading heading `#`, a whole `|---|`-style table
 * separator row, link syntax `[text](url)` → `text`, bold/italic wrappers
 * (`**`/`__`/`*`/`_`), backticks, and table pipe characters (which become
 * a plain space so table cells still read as separate words). Only has to
 * handle what an LLM answer actually produces, not arbitrary Markdown, so
 * a simple non-greedy match per marker is enough — except the single-`*`/
 * `_` spans, which need the flanking check in `makeSingleCharEmphasisRegex`
 * to avoid corrupting ordinary text (see that function's doc comment). */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*\|?[\s:-]+\|[\s:|-]*$/, '')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(STAR_EMPHASIS_RE, '$1')
    .replace(UNDERSCORE_EMPHASIS_RE, '$1')
    .replace(/`+/g, '')
    .replace(/\|/g, ' ')
}

/** Strips a leading list-marker (`- `, `* `, `1. `), strips inline Markdown
 * markup (see `stripInlineMarkdown`), and collapses the whitespace
 * `splitAnswerByDocRefs` leaves behind once its `ref` segments are removed
 * (e.g. a trailing space before a period from "point [Doc1]." becoming
 * "point .") into normal prose spacing, then truncates to 140 chars — no
 * trailing ellipsis (client feedback: no "..." anywhere in the UI), so a
 * truncated clause just ends where it's cut off. */
function cleanClauseText(text: string): string {
  const cleaned = stripInlineMarkdown(text.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= 140) return cleaned
  return cleaned.slice(0, 140).trimEnd()
}

/** Maps each cited `(document_id, page)` key to the answer sentence / list
 * item that first cites it — the text `CitationList` shows as `Cited for:
 * "<clause>"` under that entry, so a reader can see *why* a document made
 * the list instead of only that it did. Walks the same clauses
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
    // A clause that's nothing but citation markers — e.g. "[Doc1],
    // [Doc2]." with no surrounding prose at all — leaves only punctuation
    // debris once the refs are stripped out (a bare "."). `CitationList`
    // already falls back to "Searched, not cited" when a key has no entry
    // here at all, which reads far better than `Cited for: "."` would, so
    // skip *setting* a context in that case rather than storing the
    // punctuation. The key is deliberately left unseen (not added to
    // `contexts`), not marked-but-empty, so a later clause that cites the
    // same document with real prose can still fill it in.
    if (!/[\p{L}\p{N}]/u.test(text)) continue

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
