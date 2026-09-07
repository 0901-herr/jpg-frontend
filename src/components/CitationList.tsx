import { ExportOutlined, FileTextOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { useCallback, useState } from 'react'
import { fetchDocumentViewUrl, withPageHint } from '../api/browse'
import { type, typeColor } from '../styles/typography'
import { listRow } from '../styles/theme'
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

export default function CitationList({ sources }: CitationListProps) {
  const [openingKey, setOpeningKey] = useState<string | null>(null)

  const handleOpen = useCallback(async (source: Source) => {
    const key = `${source.index}-${source.documentId ?? source.filename}`
    setOpeningKey(key)
    try {
      await openSourceInLogicalDoc(source)
    } finally {
      setOpeningKey(null)
    }
  }, [])

  if (sources.length === 0) return null

  return (
    <div className="pt-3 mt-3 border-t border-[#ececec]">
      <p className={`${type.body} ${typeColor.body} leading-relaxed mb-2 font-semibold`}>
        Referenced documents
      </p>
      <ul className="list-none m-0 p-0 space-y-2">
        {sources.map((source) => {
          const canOpen = Boolean(source.url || source.documentId)
          const rowKey = `${source.index}-${source.documentId ?? source.filename}`
          const isOpening = openingKey === rowKey

          return (
            <li key={rowKey}>
              {canOpen ? (
                <button
                  type="button"
                  onClick={() => void handleOpen(source)}
                  disabled={isOpening}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border border-[#ececec] ${listRow} hover:bg-[#f4f3f2] transition-colors disabled:opacity-60 group`}
                >
                  <FileTextOutlined className="text-[#8e8e8e] shrink-0 text-sm group-hover:text-[#676767]" />
                  <span className="min-w-0 flex-1 self-center">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className={`${type.body} ${typeColor.body} leading-relaxed`}>
                        {source.filename}
                      </span>
                      {source.reference && (
                        <span className={`${type.body} ${typeColor.muted} leading-relaxed`}>
                          {source.reference}
                        </span>
                      )}
                    </span>
                    {source.snippet && (
                      <span
                        className={`block ${type.body} ${typeColor.secondary} leading-relaxed mt-1 line-clamp-2`}
                      >
                        {source.snippet}
                      </span>
                    )}
                  </span>
                  <ExportOutlined
                    className={`${typeColor.muted} shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity`}
                    aria-hidden
                  />
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 border border-[#ececec] rounded-[10px]">
                  <FileTextOutlined className={`${typeColor.muted} shrink-0 text-sm`} />
                  <span className="min-w-0 flex-1">
                    <span className={`${type.body} ${typeColor.body} leading-relaxed`}>
                      {source.filename}
                    </span>
                    {source.snippet && (
                      <span
                        className={`block ${type.body} ${typeColor.secondary} leading-relaxed mt-1 line-clamp-2`}
                      >
                        {source.snippet}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
