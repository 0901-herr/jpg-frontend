import { Checkbox, Spin } from 'antd'
import { useMemo } from 'react'
import type { BrowseDocumentItem } from '../api/types/browse'
import { sidebar, typeColor } from '../styles/typography'
import CategoryTag from './CategoryTag'
import IndexingStatusBadge, { getSelectableDocumentIds, isDocumentSelectable } from './IndexingStatusBadge'

interface DocumentChecklistProps {
  documents: BrowseDocumentItem[]
  selectedIds: Set<string>
  isLoading?: boolean
  hasMore?: boolean
  isLoadingMore?: boolean
  onToggle: (documentId: string, checked: boolean) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onLoadMore?: () => void
}

export default function DocumentChecklist({
  documents,
  selectedIds,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onLoadMore,
}: DocumentChecklistProps) {
  const selectableIds = useMemo(() => getSelectableDocumentIds(documents), [documents])
  const selectedSelectableCount = useMemo(
    () => selectableIds.filter((id) => selectedIds.has(id)).length,
    [selectableIds, selectedIds],
  )
  const allSelected =
    selectableIds.length > 0 && selectedSelectableCount === selectableIds.length

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center">
        <Spin size="small" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center px-3 text-center">
        <span className={`${sidebar.caption} ${typeColor.muted}`}>No documents in this folder</span>
      </div>
    )
  }

  return (
    <div className="docu-document-checklist w-full">
      {selectableIds.length > 0 && (
        <div className="flex w-full items-center justify-between gap-2 py-2">
          <Checkbox
            checked={allSelected}
            onChange={(e) => (e.target.checked ? onSelectAll() : onDeselectAll())}
            className={`${sidebar.body} !text-[#0d0d0d]`}
          >
            Select all
          </Checkbox>
          <span className={`${sidebar.caption} ${typeColor.muted} shrink-0`}>
            {selectedSelectableCount}/{selectableIds.length}
          </span>
        </div>
      )}

      {documents.map((doc) => {
        const selectable = isDocumentSelectable(doc.indexing_status, doc.queryable)
        const checked = selectedIds.has(doc.document_id)

        return (
          <div
            key={doc.document_id}
            className={`flex w-full flex-col gap-0.5 py-2 ${!selectable ? 'opacity-45' : ''}`}
          >
            <label
              className={`docu-document-row-primary flex min-w-0 items-center gap-2.5 ${
                selectable ? 'cursor-pointer' : 'cursor-not-allowed'
              }`}
            >
              <Checkbox
                checked={checked}
                disabled={!selectable}
                onChange={(e) => onToggle(doc.document_id, e.target.checked)}
                className="shrink-0"
              />
              <span
                className={`block min-w-0 flex-1 truncate ${sidebar.body} ${typeColor.primary}`}
                title={doc.filename}
              >
                {doc.filename}
              </span>
            </label>
            {/* Sibling of the filename line (not a parent of it) — the category
                tag and status badge sit on their own row, wrapping if needed, so
                a long badge label can never collapse the filename. Status detail
                is surfaced by the badge's own tooltip (status_reason, else the
                long label), so no separate hint line is rendered here. */}
            <div className="docu-document-row-meta flex flex-wrap items-center gap-1.5 pl-[1.625rem]">
              <CategoryTag category={doc.classification_category} />
              <IndexingStatusBadge
                status={doc.indexing_status}
                statusReason={doc.status_reason}
                compact
              />
            </div>
          </div>
        )
      })}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className={`w-full mt-1 py-2 text-center ${sidebar.caption} ${typeColor.muted} disabled:opacity-50`}
        >
          {isLoadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
