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

  if (!canOpen) {
    return <span className={className}>{label}</span>
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={opening}
      className={`inline text-inherit underline decoration-[#c8c8c8] underline-offset-2 hover:decoration-[#676767] disabled:opacity-60 ${className ?? ''}`}
      title={`Open ${source.filename} in LogicalDOC`}
    >
      {label}
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
                          className={`text-left ${type.body} ${typeColor.body} leading-relaxed underline decoration-[#c8c8c8] underline-offset-2 hover:decoration-[#676767] disabled:opacity-60`}
                        >
                          {group.filename}
                        </button>
                      ) : (
                        <span className={`${type.body} ${typeColor.body} leading-relaxed`}>
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
