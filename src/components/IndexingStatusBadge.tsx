import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { IndexingStatus, BrowseDocumentItem } from '../api/types/browse'
import { type } from '../styles/typography'
import { radius } from '../styles/theme'

const STATUS_CONFIG: Record<
  IndexingStatus,
  { label: string; className: string; icon: ReactNode }
> = {
  READY: {
    label: 'Ready',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircleOutlined />,
  },
  INDEXING: {
    label: 'Indexing',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <ClockCircleOutlined />,
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200',
    icon: <CloseCircleOutlined />,
  },
  NOT_INDEXED: {
    label: 'Not indexed',
    className: 'bg-zinc-100 text-zinc-500 border-zinc-200',
    icon: <MinusCircleOutlined />,
  },
}

export function getStatusLabel(status: IndexingStatus | string): string {
  const key = (status in STATUS_CONFIG ? status : 'NOT_INDEXED') as IndexingStatus
  return STATUS_CONFIG[key].label
}

interface IndexingStatusBadgeProps {
  status: IndexingStatus | string
  variant?: 'badge' | 'text'
}

export default function IndexingStatusBadge({
  status,
  variant = 'badge',
}: IndexingStatusBadgeProps) {
  const key = (status in STATUS_CONFIG ? status : 'NOT_INDEXED') as IndexingStatus
  const config = STATUS_CONFIG[key]

  if (variant === 'text') {
    return (
      <span className={`shrink-0 text-xs text-[#0d0d0d] whitespace-nowrap`}>{config.label}</span>
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 ${radius.full} px-2 py-0.5 border ${type.caption} ${config.className}`}
    >
      <span className="text-xs leading-none">{config.icon}</span>
      {config.label}
    </span>
  )
}

export function isDocumentSelectable(status: IndexingStatus | string, queryable: boolean): boolean {
  if (!queryable) return false
  return status === 'READY' || status === 'INDEXING'
}

export function getSelectableDocumentIds(documents: BrowseDocumentItem[]): string[] {
  return documents
    .filter((doc) => isDocumentSelectable(doc.indexing_status, doc.queryable))
    .map((doc) => doc.document_id)
}

export function getSelectionWarning(status: IndexingStatus | string): string | null {
  if (status === 'INDEXING') return 'Still indexing — answers may be incomplete'
  if (status === 'FAILED') return 'Indexing failed — not queryable'
  if (status === 'NOT_INDEXED') return 'Not indexed — not queryable'
  return null
}
