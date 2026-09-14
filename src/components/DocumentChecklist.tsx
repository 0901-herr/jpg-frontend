import { Checkbox, Spin, Tooltip } from 'antd'
import { useMemo } from 'react'
import type { BrowseDocumentItem } from '../api/types/browse'
import { sidebar, typeColor } from '../styles/typography'
import CategoryTag from './CategoryTag'
import IndexingStatusBadge, {
  getDocumentSelectionHint,
  getSelectableDocumentIds,
  isDocumentSelectable,
} from './IndexingStatusBadge'

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

function showsIndexingHoverHint(doc: BrowseDocumentItem): boolean {
  if (doc.queryable) return false
  return doc.indexing_status === 'NOT_INDEXED' || doc.indexing_status === 'FAILED'
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
        const hint = getDocumentSelectionHint(doc)
        const checked = selectedIds.has(doc.document_id)
        const hoverHint = showsIndexingHoverHint(doc) ? (hint ?? 'Not indexed') : null

        const row = (
          <div
            className={`flex w-full items-center gap-2.5 py-2 ${
              !selectable ? 'opacity-45' : ''
            }`}
          >
            <label
              className={`flex min-w-0 flex-1 items-center gap-2.5 ${
                selectable ? 'cursor-pointer' : 'cursor-not-allowed'
              }`}
            >
              <Checkbox
                checked={checked}
                disabled={!selectable}
                onChange={(e) => onToggle(doc.document_id, e.target.checked)}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${sidebar.body} ${typeColor.primary}`}>
                  {doc.filename}
                </span>
                <CategoryTag category={doc.classification_category} />
                {hint && checked && (
                  <span className={`block ${sidebar.caption} ${typeColor.primary} mt-0.5`}>
                    {hint}
                  </span>
                )}
              </span>
            </label>
            <IndexingStatusBadge status={doc.indexing_status} statusReason={doc.status_reason} />
          </div>
        )

        if (!hoverHint) return <div key={doc.document_id}>{row}</div>

        return (
          <Tooltip
            key={doc.document_id}
            title={hoverHint}
            placement="right"
            mouseEnterDelay={0.2}
            overlayClassName="docu-doc-status-tooltip"
          >
            {row}
          </Tooltip>
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
