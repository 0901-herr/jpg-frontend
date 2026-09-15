import { message } from 'antd'
import { ChatChevronIcon, ChatDescriptionIcon, ChatExpandIcon, ChatRedirectIcon } from '../icons/chat'
import { Fragment, useCallback, useId, useMemo, useState } from 'react'
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
 * "<filename> · p. <page>" reference is still one hover away, in `title`
 * (`citationTooltipText` below), and the same number is repeated next to
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
 * the circle, and `relative top-[0.2em]` (rather than the `sub` keyword,
 * whose exact drop varies by browser/font) nudges it below the baseline by
 * a small, fixed amount so a cited line never grows taller than an uncited
 * one. Callers passing `className` must not add their own margin/padding
 * utilities (Tailwind class precedence is not append-order-safe, and those
 * properties are owned by `.docu-citation-pill` regardless). */
const CITATION_PILL_CLASS =
  'docu-citation-pill relative top-[0.2em] inline-flex items-center justify-center align-baseline'

/** Full "<filename> · p. <page>" reference shown as the pill's tooltip —
 * the pill itself only shows the citation's number, so this native `title`
 * is where a sighted reader actually learns which document and page it
 * points to (a screen reader gets the same information from `label`,
 * `citationDisplayLabel`'s "(File.pdf, Page N)" form, as the accessible
 * name). Unlike the old pill text, this is never truncated — a tooltip has
 * room for the full filename. */
function citationTooltipText(source: Source): string {
  return source.page != null ? `${source.filename} · p. ${source.page}` : source.filename
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
  const tooltip = citationTooltipText(source)

  if (!canOpen) {
    return (
      <span
        className={`${CITATION_PILL_CLASS} ${className ?? ''}`}
        title={tooltip}
        aria-label={label}
      >
        {number}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={opening}
      className={`${CITATION_PILL_CLASS} disabled:opacity-60 ${className ?? ''}`}
      title={tooltip}
      aria-label={label}
    >
      {number}
    </button>
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
 * group sorts into "Also searched" instead. `citedKey` is the
 * `citationNumberKey` of the *specific page* that earned `citedNumber` —
 * captured here, alongside the number, rather than re-derived later by
 * scanning `group.pages` in page-number order (fix round 1: that re-scan
 * picked whichever page sorts first by page number, which isn't
 * necessarily the group's own first-cited page when a document's pages
 * are cited out of page-number order — e.g. page 5 cited first, page 2
 * cited second, but `group.pages` sorts page 2 before page 5). */
interface OrderedGroup {
  group: DocumentGroup
  citedNumber: number | undefined
  citedKey: string | undefined
}

function orderGroups(groups: DocumentGroup[], numbers: Map<string, number>): OrderedGroup[] {
  return groups.map((group) => {
    let citedNumber: number | undefined
    let citedKey: string | undefined
    for (const entry of group.pages) {
      const key = citationNumberKey(entry.source)
      const n = numbers.get(key)
      if (n != null && (citedNumber == null || n < citedNumber)) {
        citedNumber = n
        citedKey = key
      }
    }
    return { group, citedNumber, citedKey }
  })
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
  citedFor,
  question,
  openingKey,
  onOpen,
}: {
  group: DocumentGroup
  numbers: Map<string, number>
  /** The answer sentence/list-item this document was cited for, or
   * `undefined` when it was retrieved but never actually cited. */
  citedFor: string | undefined
  question: string
  openingKey: string | null
  onOpen: (source: Source, key: string) => void
}) {
  const canOpenRow = Boolean(group.url || group.documentId)
  const firstPage = group.pages[0]
  const rowOpeningKey = `${group.key}-row`
  const isRowOpening = openingKey === rowOpeningKey

  return (
    <li>
      <div
        className={`group flex items-start gap-3 px-3 py-2.5 border border-[#ececec] ${listRow} hover:bg-[#f4f3f2] transition-colors`}
      >
        <ChatDescriptionIcon sx={{ fontSize: 20 }} className={`${typeColor.primary} shrink-0`} />
        <div className="min-w-0 flex-1">
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

            {group.pages.map((entry) => {
              if (entry.page == null) return null
              const canOpenPage = Boolean(entry.source.url || entry.source.documentId)
              const pageKey = `${group.key}-p${entry.page}`
              const isPageOpening = openingKey === pageKey
              // Prefixed with the same number the inline pill for this
              // exact citation shows, so a reader can map one to the
              // other. A page that was retrieved but never cited (an
              // "Also searched" entry) has no number to show.
              const number = numbers.get(citationNumberKey(entry.source))
              const label = number != null ? `${number} · p. ${entry.page}` : `p. ${entry.page}`

              if (!canOpenPage) {
                return (
                  <span
                    key={pageKey}
                    className={`${type.caption} ${typeColor.muted} rounded-full border border-[#ececec] px-2 py-0.5`}
                  >
                    {label}
                  </span>
                )
              }

              return (
                <button
                  key={pageKey}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(entry.source, pageKey)
                  }}
                  disabled={isPageOpening}
                  title={`Open ${group.filename} at page ${entry.page} in LogicalDOC`}
                  className={`${type.caption} ${typeColor.body} rounded-full border border-[#ececec] px-2 py-0.5 hover:bg-white hover:border-[#c8c8c8] disabled:opacity-60 transition-colors`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Why this document is in the list — the answer sentence it
              backs, or an honest "not cited" for a retrieval candidate the
              answer never actually quoted (client feedback: nothing told
              the reader why a document was relevant). */}
          <span className={`block ${type.caption} ${typeColor.muted} leading-relaxed mt-1`}>
            {citedFor ? <>Cited for: &quot;{citedFor}&quot;</> : 'Searched, not cited'}
          </span>

          {group.snippet && (
            <span
              className={`block ${type.body} ${typeColor.secondary} leading-relaxed mt-1 line-clamp-2`}
            >
              <HighlightedSnippet text={group.snippet} question={question} />
            </span>
          )}
        </div>
        {canOpenRow && (
          <ChatRedirectIcon
            className={`${typeColor.primary} shrink-0 opacity-0 group-hover:opacity-100 transition-opacity`}
            aria-hidden
          />
        )}
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

  // The page holding the group's own minimum cited number — the same page
  // `orderGroups` used to decide this row's position in the list — carries
  // the group's citation context, not whichever page happens to sort first
  // by page number.
  const citedForOf = (ordered: OrderedGroup): string | undefined =>
    ordered.citedKey != null ? contexts.get(ordered.citedKey) : undefined

  return (
    <div className="pt-3 mt-3 border-t border-[#ececec]">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full flex items-center gap-2 py-1 text-left hover:opacity-80 transition-opacity"
      >
        {expanded ? (
          <ChatExpandIcon className="text-[#8e8e8e] shrink-0" aria-hidden />
        ) : (
          <ChatChevronIcon className="text-[#8e8e8e] shrink-0" aria-hidden />
        )}
        <span className={`${type.body} ${typeColor.body} leading-relaxed font-semibold`}>
          Related documents
        </span>
        <span className={`${type.caption} ${typeColor.muted}`}>({headerCount})</span>
      </button>

      {expanded && (
        <div id={panelId} className="pt-2">
          {citedGroups.length > 0 && (
            <ul className="list-none m-0 p-0 space-y-2">
              {citedGroups.map((ordered) => (
                <DocumentRow
                  key={ordered.group.key}
                  group={ordered.group}
                  numbers={numbers}
                  citedFor={citedForOf(ordered)}
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
                {showAlsoSearched ? (
                  <ChatExpandIcon className="text-[#8e8e8e] shrink-0" aria-hidden />
                ) : (
                  <ChatChevronIcon className="text-[#8e8e8e] shrink-0" aria-hidden />
                )}
                <span className={`${type.caption} ${typeColor.muted} font-medium`}>
                  Also searched ({uncitedGroups.length})
                </span>
              </button>

              {showAlsoSearched && (
                <ul id={alsoSearchedId} className="list-none m-0 p-0 pt-2 space-y-2">
                  {uncitedGroups.map(({ group }) => (
                    <DocumentRow
                      key={group.key}
                      group={group}
                      numbers={numbers}
                      citedFor={undefined}
                      question={question ?? ''}
                      openingKey={openingKey}
                      onOpen={(source, key) => void handleOpen(source, key)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
