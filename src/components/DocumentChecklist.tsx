import { Checkbox, Spin, Tooltip } from 'antd'
import { useMemo } from 'react'
import type { BrowseDocumentItem } from '../api/types/browse'
import { sidebar, typeColor } from '../styles/typography'
import { FEATURES } from '../config/features'
import {
  MAX_EXPLICIT_SELECTION,
  SELECTION_LIMIT_MESSAGE,
  SELECTION_LIMIT_ROW_HINT,
} from '../config/selection'
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
  onToggle: (documentId: string, checked: boolean) => boolean | void
  onSelectAll: () => boolean | void
  onDeselectAll: () => void
  onSelectionLimitExceeded?: () => void
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
  onSelectionLimitExceeded,
  onLoadMore,
}: DocumentChecklistProps) {
  const selectableIds = useMemo(() => getSelectableDocumentIds(documents), [documents])
  const selectedSelectableCount = useMemo(
    () => selectableIds.filter((id) => selectedIds.has(id)).length,
    [selectableIds, selectedIds],
  )
  const allSelected =
    selectableIds.length > 0 && selectedSelectableCount === selectableIds.length
  const someSelected = selectedSelectableCount > 0 && !allSelected
  const selectionLimitReached = selectedIds.size >= MAX_EXPLICIT_SELECTION

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
            indeterminate={someSelected}
            onChange={() => {
              if (allSelected || someSelected) {
                onDeselectAll()
              } else if (onSelectAll() === false) {
                onSelectionLimitExceeded?.()
              }
            }}
            title={selectionLimitReached ? SELECTION_LIMIT_MESSAGE : undefined}
            className={`${sidebar.body} !text-[#0d0d0d]`}
          >
            {allSelected || someSelected ? 'Deselect all' : 'Select all'}
          </Checkbox>
          <span className={`${sidebar.caption} ${typeColor.muted} shrink-0`}>
            {selectedSelectableCount}/{selectableIds.length}
          </span>
        </div>
      )}

      {documents.map((doc) => {
        const selectable = isDocumentSelectable(doc.indexing_status, doc.queryable)
        const checked = selectedIds.has(doc.document_id)

        // Selectable rows get no extra tooltip — only a non-selectable row
        // needs an explanation for why it can't be checked, and that
        // explanation belongs on the row itself (checkbox + filename), not
        // just the small status badge underneath (UX P1-2).
        const statusHint = selectable ? null : getDocumentSelectionHint(doc)
        // A row that IS selectable by status but is disabled because the
        // 500-file limit is reached needs its own explanation too — a
        // disabled antd Checkbox never fires onChange, so without this a
        // click on that row does nothing, silently (owner requirement,
        // 2026-09-23 demo prep). Status-based hint wins when both apply.
        const limitHint =
          selectable && !checked && selectionLimitReached ? SELECTION_LIMIT_ROW_HINT : null
        const selectionHint = statusHint ?? limitHint
        const dimmed = !selectable || limitHint != null

        const label = (
          <label
            className={`docu-document-row-primary flex min-w-0 items-center gap-2.5 ${
              selectable && (!selectionLimitReached || checked)
                ? 'cursor-pointer'
                : 'cursor-not-allowed'
            }`}
          >
            <Checkbox
              checked={checked}
              disabled={!selectable || (!checked && selectionLimitReached)}
              onChange={(e) => {
                if (onToggle(doc.document_id, e.target.checked) === false) {
                  onSelectionLimitExceeded?.()
                }
              }}
              className="shrink-0"
            />
            <span
              className={`block min-w-0 flex-1 truncate ${sidebar.body} ${typeColor.primary}`}
              title={doc.filename}
            >
              {doc.filename}
            </span>
          </label>
        )

        return (
          <div
            key={doc.document_id}
            className={`flex w-full flex-col gap-0.5 py-2 ${dimmed ? 'opacity-45' : ''}`}
          >
            {selectionHint ? (
              <Tooltip title={selectionHint} mouseEnterDelay={0.2}>
                {label}
              </Tooltip>
            ) : (
              label
            )}
            {/* Sibling of the filename line (not a parent of it) — the category
                tag and status badge sit on their own row, wrapping if needed, so
                a long badge label can never collapse the filename. The badge
                keeps its own tooltip too (status_reason, else the long label)
                for anyone hovering the badge directly. */}
            <div className="docu-document-row-meta flex flex-wrap items-center gap-1.5 pl-[1.625rem]">
              {FEATURES.categoryView && <CategoryTag category={doc.classification_category} />}
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
          {isLoadingMore ? 'Loading' : 'Load more'}
        </button>
      )}
    </div>
  )
}
