import { message, Tooltip } from 'antd'
import { ChatChevronIcon, ChatDescriptionIcon } from '../icons/chat'
import { Fragment, useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import { fetchDocumentViewUrl, withPageHint } from '../api/browse'
import { type, typeColor } from '../styles/typography'
import { listRow } from '../styles/theme'
import { groupSourcesByDocument, type DocumentGroup } from '../utils/citationGroups'
import {
  citationContextByAnswerOrder,
  citationNumberKey,
  highlightSignificantWords,
  numberCitationsByAnswerOrder,
} from '../utils/citations'
import type { Source } from '../types'

async function resolveSourceUrl(source: Source): Promise<string | null> {
  if (source.url) return withPageHint(source.url, source.page)
  if (!source.documentId) return null
  try {
    return await fetchDocumentViewUrl(source.documentId, source.page)
  } catch {
    return null
  }
}

export async function openSourceInLogicalDoc(source: Source): Promise<void> {
  const url = await resolveSourceUrl(source)
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    message.error('Could not open document in LogicalDOC')
  }
}

interface CitationLinkProps {
  source: Source
  label: string
  /** This citation's stable per-message number (from
   * `numberCitationsByAnswerOrder`) — the only thing the pill itself
   * displays. */
  number: number
  className?: string
}

/** Base pill styling shared by the openable (`<button>`) and non-openable
 * (`<span>`) shapes — a small round numbered chip inline with the answer
 * text ("1", "2", …, numbered-pill style), replacing the earlier filename
 * chip: the client asked for something that reads as a citation marker,
 * not a second copy of the filename crowding the answer text; the full
 * `<filename> · p. <page>` reference is still one hover away, in the
 * citation preview tooltip, and the same number is repeated next to
 * the matching page chip in "Related documents" (`CitationList` below) so
 * a reader can map a pill straight to its document.
 *
 * Every box-model and colour property — `font-size`, `line-height`,
 * `min-width`, `height`, `padding`, `margin`, `border-radius`, `color`,
 * `background` — lives in the plain, unlayered `.docu-citation-pill` class
 * in `src/index.css` instead of as Tailwind utilities here, and stays
 * there even though only five of those properties are actually contested:
 * `src/main.tsx` loads `antd/dist/reset.css`, which is unlayered and sets
 * `button { margin; color; font-size; font-family; line-height }`, and
 * Tailwind v4 puts every utility in `@layer utilities` — unlayered CSS
 * always wins over layered CSS, regardless of specificity or source order.
 * This class selector (0,1,0) outranks the reset's element selector (0,0,1)
 * among unlayered rules, so it wins on both the `<button>` and `<span>`
 * pill shapes. Keeping the whole set in one place (rather than splitting
 * "contested" from "uncontested" properties across two files) is what
 * actually keeps the chip circular — see `src/index.css` for the values.
 *
 * The remaining utilities below are layout/position only, untouched by the
 * reset: `inline-flex items-center justify-center` centers the digit in
 * the circle, and `align-middle` vertically centers the pill with the
 * surrounding text row. Callers passing `className` must not add their own
 * margin/padding utilities (Tailwind class precedence is not
 * append-order-safe, and those properties are owned by `.docu-citation-pill`
 * regardless). */
const CITATION_PILL_CLASS =
  'docu-citation-pill inline-flex items-center justify-center align-middle'

/** Hover preview for a citation pill — filename, optional page, and any
 * snippet excerpt so the reader can see where the link will open. */
function CitationHoverPreview({ source }: { source: Source }) {
  return (
    <div className="docu-citation-preview">
      <p className="docu-citation-preview-filename m-0">{source.filename}</p>
      {source.page != null && (
        <p className="docu-citation-preview-meta m-0">Page {source.page}</p>
      )}
      {source.snippet && (
        <p className="docu-citation-preview-snippet m-0">{source.snippet}</p>
      )}
    </div>
  )
}

function withCitationTooltip(source: Source, child: ReactNode) {
  return (
    <Tooltip
      title={<CitationHoverPreview source={source} />}
      placement="top"
      mouseEnterDelay={0.15}
      classNames={{ root: 'docu-citation-preview-tooltip' }}
    >
      {child}
    </Tooltip>
  )
}

export function CitationLink({ source, label, number, className }: CitationLinkProps) {
  const [opening, setOpening] = useState(false)

  const handleClick = useCallback(async () => {
    setOpening(true)
    try {
      await openSourceInLogicalDoc(source)
    } finally {
      setOpening(false)
    }
  }, [source])

  const canOpen = Boolean(source.url || source.documentId)

  if (!canOpen) {
    return withCitationTooltip(
      source,
      <span
        className={`${CITATION_PILL_CLASS} ${className ?? ''}`}
        aria-label={label}
      >
        {number}
      </span>,
    )
  }

  return withCitationTooltip(
    source,
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={opening}
      className={`${CITATION_PILL_CLASS} disabled:opacity-60 ${className ?? ''}`}
      aria-label={label}
    >
      {number}
    </button>,
  )
}

interface CitationListProps {
  sources: Source[]
  /** The assistant message's own answer text — the only place citation
   * numbers now come from (`numberCitationsByAnswerOrder`) and the source
   * of each entry's "Cited for" text (`citationContextByAnswerOrder`), so
   * this list always agrees with the inline pills in that same answer. */
  content: string
  /** The user's question, for highlighting the words in each entry's
   * snippet that actually matter to it (see `highlightSignificantWords`).
   * Optional — omitted, every snippet renders with no highlighting. */
  question?: string
}

/** A document group ordered into the list: `citedNumber` is the lowest
 * inline-citation number among its pages (used to sort cited groups
 * ascending, matching the order pills first appear in the answer), or
 * `undefined` when none of the group's pages are actually cited — that
 * group sorts into "Also searched" instead. */
interface OrderedGroup {
  group: DocumentGroup
  citedNumber: number | undefined
}

function orderGroups(groups: DocumentGroup[], numbers: Map<string, number>): OrderedGroup[] {
  return groups.map((group) => {
    let citedNumber: number | undefined
    for (const entry of group.pages) {
      const n = numbers.get(citationNumberKey(entry.source))
      if (n != null && (citedNumber == null || n < citedNumber)) {
        citedNumber = n
      }
    }
    return { group, citedNumber }
  })
}

/** `group.pages` is sorted ascending by *page number* (see
 * `groupSourcesByDocument`) — a document cited out of page order (e.g.
 * marker 2 on page 1, marker 3 on page 2, marker 1 on page 9) would
 * otherwise render its pill row as "2, 3, 1", not matching the order the
 * markers actually appear in the answer. This re-sorts a copy for display
 * only: cited pages ascending by their inline-citation number (matching
 * the pills a reader has already seen in the answer text), then any
 * uncited pages within the same document (no number — a retrieval chunk
 * that was never actually quoted) after them, in their original
 * page-ascending order. */
function orderPagesForDisplay(
  pages: DocumentGroup['pages'],
  numbers: Map<string, number>,
): DocumentGroup['pages'] {
  return [...pages].sort((a, b) => {
    const na = numbers.get(citationNumberKey(a.source))
    const nb = numbers.get(citationNumberKey(b.source))
    if (na != null && nb != null) return na - nb
    if (na != null) return -1
    if (nb != null) return 1
    return (a.page ?? Number.POSITIVE_INFINITY) - (b.page ?? Number.POSITIVE_INFINITY)
  })
}

/** Every citation clause for this document, not just the one behind its
 * lowest number — a document cited 3 times (3 different markers) had only
 * one "Cited for" line before, silently dropping the other two. Returns
 * one `{ number, text }` per cited page in the group that has a captured
 * clause (`citationContextByAnswerOrder` can leave a cited key out when
 * its clause was nothing but citation markers — see that function's doc
 * comment), sorted ascending by marker number so the list reads in the
 * same order the pills do. */
function citedContextsOf(
  group: DocumentGroup,
  numbers: Map<string, number>,
  contexts: Map<string, string>,
): Array<{ number: number; text: string }> {
  const result: Array<{ number: number; text: string }> = []
  for (const entry of group.pages) {
    const key = citationNumberKey(entry.source)
    const number = numbers.get(key)
    if (number == null) continue
    const text = contexts.get(key)
    if (!text) continue
    result.push({ number, text })
  }
  return result.sort((a, b) => a.number - b.number)
}

/** Renders a snippet with each word from `question` (≥ 4 letters, stop
 * words removed) shown bolder than the rest — see
 * `highlightSignificantWords`. Falls back to plain text when there is no
 * question to highlight against. */
function HighlightedSnippet({ text, question }: { text: string; question: string }) {
  return (
    <>
      {highlightSignificantWords(text, question).map((segment, i) =>
        segment.highlight ? (
          <span key={i} className="font-medium text-[#0d0d0d]">
            {segment.text}
          </span>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}

/** One "Related documents" row: everything cited (or, for an uncited
 * "Also searched" entry, everything retrieved but never quoted) from a
 * single document. */
function DocumentRow({
  group,
  numbers,
  citedContexts,
  question,
  openingKey,
  onOpen,
}: {
  group: DocumentGroup
  numbers: Map<string, number>
  /** One entry per citation of this document the answer actually quoted
   * — its marker number and the clause it backs, in marker order. Empty
   * when the document was retrieved but never actually cited. */
  citedContexts: Array<{ number: number; text: string }>
  question: string
  openingKey: string | null
  onOpen: (source: Source, key: string) => void
}) {
  const canOpenRow = Boolean(group.url || group.documentId)
  const firstPage = group.pages[0]
  const rowOpeningKey = `${group.key}-row`
  const isRowOpening = openingKey === rowOpeningKey
  const orderedPages = orderPagesForDisplay(group.pages, numbers)

  return (
    <li>
      <div
        className={`docu-citation-row group relative flex items-center gap-3 px-3 py-2.5 border border-[#ececec] ${listRow} hover:bg-[#f4f3f2] transition-colors`}
      >
        <ChatDescriptionIcon
          sx={{ fontSize: 20 }}
          className={`docu-citation-row-icon ${typeColor.primary} shrink-0`}
          aria-hidden
        />
        <div className="docu-citation-row-body min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {canOpenRow ? (
              <button
                type="button"
                onClick={() => firstPage && onOpen(firstPage.source, rowOpeningKey)}
                disabled={isRowOpening}
                className={`min-w-0 break-words text-left ${type.body} ${typeColor.body} leading-relaxed underline decoration-[#c8c8c8] underline-offset-2 hover:decoration-[#676767] disabled:opacity-60`}
              >
                {group.filename}
              </button>
            ) : (
              <span className={`min-w-0 break-words ${type.body} ${typeColor.body} leading-relaxed`}>
                {group.filename}
              </span>
            )}

            {orderedPages.map((entry) => {
              // Same number the inline pill for this citation shows, so a
              // reader can map one to the other. Uncited pages have none.
              const number = numbers.get(citationNumberKey(entry.source))
              if (number == null && entry.page == null) return null

              const canOpenPage = Boolean(entry.source.url || entry.source.documentId)
              const pageKey =
                entry.page != null ? `${group.key}-p${entry.page}` : `${group.key}-c${number}`
              const isPageOpening = openingKey === pageKey

              // One cohesive pill per citation — marker + page together
              // (client feedback: a separate number pill and page pill
              // read as two unrelated chips). A citation with no page
              // known shows just the marker.
              const pill = (
                <span className="docu-citation-chip">
                  {number != null && (
                    <span className="docu-citation-chip-num" aria-hidden>
                      {number}
                    </span>
                  )}
                  {number != null && entry.page != null && ' · '}
                  {entry.page != null && <>p. {entry.page}</>}
                </span>
              )

              if (!canOpenPage) {
                return <Fragment key={pageKey}>{pill}</Fragment>
              }

              const title =
                entry.page != null
                  ? `Open ${group.filename} at page ${entry.page} in LogicalDOC`
                  : `Open ${group.filename} in LogicalDOC`

              return (
                <button
                  key={pageKey}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(entry.source, pageKey)
                  }}
                  disabled={isPageOpening}
                  title={title}
                  className="docu-citation-page-chips disabled:opacity-60"
                >
                  {pill}
                </button>
              )
            })}
          </div>

          {/* Why this document is in the list — every answer clause it
              backs (client feedback: only the first of 3 citations showed,
              silently dropping the other two), each prefixed with the same
              marker chip as its pill above — or an honest "not cited" for
              a retrieval candidate the answer never actually quoted
              (client feedback: nothing told the reader why a document was
              relevant). */}
          {citedContexts.length > 0 ? (
            <div className="mt-1 space-y-1">
              <span className={`block ${type.caption} ${typeColor.muted}`}>Cited for:</span>
              {citedContexts.map(({ number, text }) => (
                <div key={number} className="flex items-start gap-1.5">
                  <span className="docu-citation-chip-num mt-px shrink-0" aria-hidden>
                    {number}
                  </span>
                  <span
                    className={`${type.caption} ${typeColor.muted} leading-relaxed line-clamp-2`}
                    title={text}
                  >
                    &quot;{text}&quot;
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className={`block ${type.caption} ${typeColor.muted} leading-relaxed mt-1`}>
              Searched, not cited
            </span>
          )}

          {group.snippet && (
            <span
              className={`block ${type.body} ${typeColor.secondary} leading-relaxed mt-1 line-clamp-2`}
            >
              <HighlightedSnippet text={group.snippet} question={question} />
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/** Renders one "Related documents" row per *document*, not per citation —
 * a document cited from 5 different chunks/pages is one row with 5 small
 * page chips, not 5 rows repeating the same filename. The row's filename
 * area opens the first (lowest-numbered) page; each page chip opens that
 * specific page. Grouping happens only here, at render time — the
 * `Source[]` array on the message, and inline `(file.pdf, Page 2)` links
 * elsewhere in the answer, are unaffected.
 *
 * Ordered cited-first (ascending by the lowest inline-citation number in
 * the group, i.e. answer order), then every document that was retrieved
 * but never actually quoted under a collapsed "Also searched (n)"
 * sub-section — so the list a reader sees first matches what the answer
 * actually relied on, with the rest available a click away rather than
 * mixed in ahead of it. */
export default function CitationList({ sources, content, question }: CitationListProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAlsoSearched, setShowAlsoSearched] = useState(false)
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  const panelId = useId()
  const alsoSearchedId = useId()

  const groups = useMemo(() => groupSourcesByDocument(sources), [sources])
  // Same numbering `CitationLink` (via `markdownRenderers.tsx`) assigns
  // inline, computed over this same `content` + `sources` — so the digit
  // next to a page chip here always matches the pill that cites it in the
  // answer, and an uncited document carries no number at all.
  const numbers = useMemo(() => numberCitationsByAnswerOrder(content, sources), [content, sources])
  const contexts = useMemo(() => citationContextByAnswerOrder(content, sources), [content, sources])

  const ordered = useMemo(() => orderGroups(groups, numbers), [groups, numbers])
  const citedGroups = useMemo(
    () =>
      ordered
        .filter((o): o is OrderedGroup & { citedNumber: number } => o.citedNumber != null)
        .sort((a, b) => a.citedNumber - b.citedNumber),
    [ordered],
  )
  const uncitedGroups = useMemo(() => ordered.filter((o) => o.citedNumber == null), [ordered])

  const handleOpen = useCallback(async (source: Source, key: string) => {
    setOpeningKey(key)
    try {
      await openSourceInLogicalDoc(source)
    } finally {
      setOpeningKey(null)
    }
  }, [])

  if (groups.length === 0) return null

  const headerCount = citedGroups.length > 0 ? citedGroups.length : groups.length

  return (
    <div className="pt-3 mt-3 border-t border-[#ececec]">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full flex items-center gap-2 py-1 text-left hover:opacity-80 transition-opacity"
      >
        <ChatChevronIcon
          className={`docu-tree-chevron${expanded ? ' expanded' : ''}`}
          aria-hidden
        />
        <span className={`${type.body} ${typeColor.body} leading-relaxed font-semibold`}>
          Related documents
        </span>
        <span className={`${type.caption} ${typeColor.muted}`}>({headerCount})</span>
      </button>

      <div
        id={panelId}
        className={`docu-collapse-panel${expanded ? ' is-open' : ''}`}
        aria-hidden={!expanded}
        inert={!expanded || undefined}
      >
        <div className="docu-collapse-panel-inner">
          <div className="pt-2">
            {citedGroups.length > 0 && (
              <ul className="list-none m-0 p-0 space-y-2">
                {citedGroups.map((ordered) => (
                  <DocumentRow
                    key={ordered.group.key}
                    group={ordered.group}
                    numbers={numbers}
                    citedContexts={citedContextsOf(ordered.group, numbers, contexts)}
                    question={question ?? ''}
                    openingKey={openingKey}
                    onOpen={(source, key) => void handleOpen(source, key)}
                  />
                ))}
              </ul>
            )}

            {uncitedGroups.length > 0 && (
              <div className={citedGroups.length > 0 ? 'pt-2 mt-2 border-t border-[#f0f0f0]' : ''}>
                <button
                  type="button"
                  onClick={() => setShowAlsoSearched((open) => !open)}
                  aria-expanded={showAlsoSearched}
                  aria-controls={alsoSearchedId}
                  className="w-full flex items-center gap-1.5 py-1 text-left hover:opacity-80 transition-opacity"
                >
                  <ChatChevronIcon
                    className={`docu-tree-chevron${showAlsoSearched ? ' expanded' : ''}`}
                    aria-hidden
                  />
                  <span className={`${type.caption} ${typeColor.muted} font-medium`}>
                    Also searched ({uncitedGroups.length})
                  </span>
                </button>

                <div
                  id={alsoSearchedId}
                  className={`docu-collapse-panel${showAlsoSearched ? ' is-open' : ''}`}
                  aria-hidden={!showAlsoSearched}
                  inert={!showAlsoSearched || undefined}
                >
                  <div className="docu-collapse-panel-inner">
                    <ul className="list-none m-0 p-0 pt-2 space-y-2">
                      {uncitedGroups.map(({ group }) => (
                        <DocumentRow
                          key={group.key}
                          group={group}
                          numbers={numbers}
                          citedContexts={[]}
                          question={question ?? ''}
                          openingKey={openingKey}
                          onOpen={(source, key) => void handleOpen(source, key)}
                        />
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
