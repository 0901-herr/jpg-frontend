import { message } from 'antd'
import { ChatChevronIcon, ChatDescriptionIcon, ChatExpandIcon, ChatRedirectIcon } from '../icons/chat'
import { useCallback, useId, useMemo, useState } from 'react'
import { fetchDocumentViewUrl, withPageHint } from '../api/browse'
import { type, typeColor } from '../styles/typography'
import { listRow } from '../styles/theme'
import { groupSourcesByDocument } from '../utils/citationGroups'
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
  className?: string
}

/** Base pill styling shared by the openable (`<button>`) and non-openable
 * (`<span>`) shapes — a compact filename chip inline with the answer text,
 * replacing the old underlined "(File.pdf, Page 2)" text run. Deliberately
 * subscript-like, clearly smaller than the body text (owner feedback, twice:
 * "something like <sub>", then "still the same size as the normal text").
 *
 * The size/line-height/margin/colour utilities that used to sit here
 * (`text-[…em]`, `leading-[…]`, `ml-[…]`, `mr-[…]`, `text-[#666]`) never
 * actually applied on the `<button>` shape: `src/main.tsx` loads
 * `antd/dist/reset.css`, which is unlayered and sets
 * `button { margin; color; font-size; font-family; line-height }`, and
 * Tailwind v4 puts every utility in `@layer utilities` — unlayered CSS
 * always wins over layered CSS, regardless of specificity or source order.
 * Those five properties now live in the plain, unlayered `.docu-citation-pill`
 * class in `src/index.css` instead, whose class selector outranks the
 * reset's element selector among unlayered rules. The remaining utilities
 * below (layout, border, background, the baseline nudge) are untouched by
 * the reset, so they stay as Tailwind classes.
 *
 * `0.625em` (10px at a 16px body) is the floor at which a mixed-case
 * filename with digits and underscores stays legible; `leading-[1.4]`
 * keeps the chip's box at ~0.875em of the surrounding text so it no longer
 * fills the line like a word does, and `py-0` (all vertical space comes
 * from line-height, not padding) keeps its total height, border included,
 * within the paragraph's line box so a cited line never grows taller than
 * an uncited one. `relative top-[0.2em]` (rather than the `sub` keyword,
 * whose exact drop varies by browser/font) nudges it below the baseline by
 * a small, fixed amount. Spacing is asymmetric on purpose: a `0.45em`
 * right margin (in the chip's own em, ~4px) separates a chip from the text
 * or chip that follows it, so two citations in a row read as two chips,
 * while the lead-in is only `0.15em` because an inline margin is not
 * collapsed at a wrap point — a bigger left margin would indent a chip
 * that lands at the start of a line. Callers passing `className` must not
 * add their own margin utilities (Tailwind class precedence is not
 * append-order-safe). */
const CITATION_PILL_CLASS =
  'docu-citation-pill relative top-[0.2em] inline-flex items-center gap-[0.25em] rounded-full border border-[#e5e5e5] bg-[#f6f6f6] px-[0.6em] py-0 align-baseline'

const CITATION_PILL_NAME_MAX_LENGTH = 28

/** Drops a trailing "*.ext" — but only a real extension, never a leading
 * dot (a dotfile-shaped name) or a name with no dot at all. */
function stripFilenameExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

function truncateForPill(name: string, max = CITATION_PILL_NAME_MAX_LENGTH): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/** The pill's own two parts: the extension-stripped, truncated filename,
 * and — only when a page is known — a "· p. N" suffix. Built directly from
 * `source` rather than the `label` prop, which stays around only as the
 * button's/span's accessible name (`citationDisplayLabel`'s full,
 * untruncated "(File.pdf, Page 2)" text) so a screen reader still gets the
 * complete reference even though sighted users see the compact chip. */
function citationPillText(source: Source): string {
  const name = truncateForPill(stripFilenameExtension(source.filename))
  return source.page != null ? `${name} · p. ${source.page}` : name
}

export function CitationLink({ source, label, className }: CitationLinkProps) {
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
  const pillText = citationPillText(source)

  if (!canOpen) {
    return (
      <span
        className={`${CITATION_PILL_CLASS} ${className ?? ''}`}
        title={source.filename}
        aria-label={label}
      >
        {pillText}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={opening}
      className={`${CITATION_PILL_CLASS} hover:bg-[#ececec] disabled:opacity-60 ${className ?? ''}`}
      title={source.filename}
      aria-label={label}
    >
      {pillText}
    </button>
  )
}

interface CitationListProps {
  sources: Source[]
}

/** Renders one "Related documents" row per *document*, not per citation —
 * a document cited from 5 different chunks/pages is one row with 5 small
 * page chips, not 5 rows repeating the same filename. The row's filename
 * area opens the first (lowest-numbered) page; each page chip opens that
 * specific page. Grouping happens only here, at render time — the
 * `Source[]` array on the message, and inline `(file.pdf, Page 2)` links
 * elsewhere in the answer, are unaffected. */
export default function CitationList({ sources }: CitationListProps) {
  const [expanded, setExpanded] = useState(false)
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  const panelId = useId()

  const groups = useMemo(() => groupSourcesByDocument(sources), [sources])

  const handleOpen = useCallback(async (source: Source, key: string) => {
    setOpeningKey(key)
    try {
      await openSourceInLogicalDoc(source)
    } finally {
      setOpeningKey(null)
    }
  }, [])

  if (groups.length === 0) return null

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
        <span className={`${type.caption} ${typeColor.muted}`}>({groups.length})</span>
      </button>

      {expanded && (
        <ul id={panelId} className="list-none m-0 p-0 pt-2 space-y-2">
          {groups.map((group) => {
            const canOpenRow = Boolean(group.url || group.documentId)
            const firstPage = group.pages[0]
            const rowOpeningKey = `${group.key}-row`
            const isRowOpening = openingKey === rowOpeningKey

            return (
              <li key={group.key}>
                <div
                  className={`group flex items-start gap-3 px-3 py-2.5 border border-[#ececec] ${listRow} hover:bg-[#f4f3f2] transition-colors`}
                >
                  <ChatDescriptionIcon
                    sx={{ fontSize: 20 }}
                    className={`${typeColor.primary} shrink-0`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {canOpenRow ? (
                        <button
                          type="button"
                          onClick={() => firstPage && void handleOpen(firstPage.source, rowOpeningKey)}
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
                        const label = `p. ${entry.page}`

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
                              void handleOpen(entry.source, pageKey)
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
                    {group.snippet && (
                      <span
                        className={`block ${type.body} ${typeColor.secondary} leading-relaxed mt-1 line-clamp-2`}
                      >
                        {group.snippet}
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
          })}
        </ul>
      )}
    </div>
  )
}
