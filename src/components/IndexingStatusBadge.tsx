import { Tooltip } from 'antd'
import type { ReactNode } from 'react'
import type { IndexingStatus, BrowseDocumentItem } from '../api/types/browse'
import {
  StatusFailedIcon,
  StatusIndexingIcon,
  StatusNotIndexedIcon,
  StatusReadyIcon,
  StatusReadyIcon14,
} from '../icons/chat'
import { type } from '../styles/typography'
import { radius } from '../styles/theme'

const STATUS_CONFIG: Record<
  IndexingStatus,
  { label: string; compactLabel: string; className: string; icon: ReactNode }
> = {
  READY: {
    label: 'Ready',
    compactLabel: 'Ready',
    className: 'bg-emerald-50 text-emerald-700',
    icon: <StatusReadyIcon />,
  },
  PARTIAL: {
    label: 'Partially ready — ready for questions',
    compactLabel: 'Partial',
    className: 'bg-sky-50 text-sky-700',
    icon: <StatusIndexingIcon />,
  },
  INDEXING: {
    label: 'Preparing',
    compactLabel: 'Preparing',
    className: 'bg-amber-50 text-amber-700',
    icon: <StatusIndexingIcon />,
  },
  FAILED: {
    label: 'Failed',
    compactLabel: 'Failed',
    className: 'bg-red-50 text-red-700',
    icon: <StatusFailedIcon />,
  },
  // Also covers adapter statuses this app doesn't model separately (e.g. PENDING).
  NOT_INDEXED: {
    label: 'Queued',
    compactLabel: 'Queued',
    className: 'bg-zinc-100 text-zinc-500',
    icon: <StatusNotIndexedIcon />,
  },
}

export function getStatusLabel(status: IndexingStatus | string): string {
  const key = (status in STATUS_CONFIG ? status : 'NOT_INDEXED') as IndexingStatus
  return STATUS_CONFIG[key].label
}

/** Full status sentence plus the adapter's own reason when it says more
 * than the label already does — the text behind a file row's status icon
 * tooltip (`StatusIcon`) and, combined with the filename there, the whole
 * tooltip's content. */
export function describeStatus(
  status: IndexingStatus | string,
  statusReason?: string | null,
): string {
  const label = getStatusLabel(status)
  const reason = statusReason?.trim()
  return reason && reason !== label ? `${label} — ${reason}` : label
}

/** Compact file-row marker: green tick only when the file is fully ready.
 * Non-ready statuses render nothing here — the row's hover tooltip (see
 * `describeStatus` / `FolderSidebar`) already explains Preparing / Queued /
 * Failed in plain language, so an icon next to those filenames just looks
 * like a stray tick. */
export function StatusIcon({
  status,
  className = '',
}: {
  status: IndexingStatus | string
  className?: string
}) {
  const key = (status in STATUS_CONFIG ? status : 'NOT_INDEXED') as IndexingStatus
  if (key !== 'READY') return null

  return (
    <span
      role="img"
      aria-label={getStatusLabel('READY')}
      className={`inline-flex shrink-0 items-center leading-none text-emerald-600 ${className}`}
    >
      <StatusReadyIcon14 />
    </span>
  )
}

interface IndexingStatusBadgeProps {
  status: IndexingStatus | string
  /** Adapter-provided detail (BrowseDocumentItem.status_reason) shown as a hover tooltip. */
  statusReason?: string | null
  variant?: 'badge' | 'text'
  /**
   * Use the short sidebar-friendly label instead of the long demo copy.
   * The long label stays discoverable: in compact mode the tooltip shows
   * statusReason if present, otherwise the long label. Defaults to false so
   * the admin page and anything else using the long label is unchanged.
   */
  compact?: boolean
}

export default function IndexingStatusBadge({
  status,
  statusReason,
  variant = 'badge',
  compact = false,
}: IndexingStatusBadgeProps) {
  const key = (status in STATUS_CONFIG ? status : 'NOT_INDEXED') as IndexingStatus
  const config = STATUS_CONFIG[key]
  const label = compact ? config.compactLabel : config.label
  const reason = statusReason?.trim() || undefined
  const tooltipText = compact ? reason || config.label : reason

  const content =
    variant === 'text' ? (
      <span className={`shrink-0 text-xs text-[#0d0d0d] whitespace-nowrap`}>{label}</span>
    ) : (
      <span
        className={`inline-flex shrink-0 items-center gap-1 ${radius.full} px-2 py-0.5 ${type.caption} ${config.className}`}
      >
        <span className="text-xs leading-none">{config.icon}</span>
        {label}
      </span>
    )

  if (!tooltipText) return content

  return (
    <Tooltip title={tooltipText} mouseEnterDelay={0.2}>
      {content}
    </Tooltip>
  )
}

export function isDocumentSelectable(status: IndexingStatus | string, queryable: boolean): boolean {
  if (!queryable) return false
  return status === 'READY' || status === 'PARTIAL' || status === 'INDEXING'
}

export function getSelectableDocumentIds(documents: BrowseDocumentItem[]): string[] {
  return documents
    .filter((doc) => isDocumentSelectable(doc.indexing_status, doc.queryable))
    .map((doc) => doc.document_id)
}

export function getSelectionWarning(status: IndexingStatus | string): string | null {
  if (status === 'PARTIAL') return 'Partially ready. Answers may be incomplete.'
  if (status === 'INDEXING') return 'Still getting ready. Answers may be incomplete.'
  if (status === 'FAILED') return 'Could not be prepared. Not ready for questions.'
  if (status === 'NOT_INDEXED') return 'Not ready yet. Not ready for questions.'
  return null
}

/** Prefer adapter status_reason; fall back to local indexing-status copy. */
export function getDocumentSelectionHint(doc: BrowseDocumentItem): string | null {
  const reason = doc.status_reason?.trim()
  if (reason) return reason
  return getSelectionWarning(doc.indexing_status)
}
