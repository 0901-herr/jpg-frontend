import {
  AdminAppsNavIcon,
  AdminFindNavIcon,
  AdminHealthNavIcon,
  AdminListNavIcon,
  AdminWarningNavIcon,
} from '../../icons/admin'
import { Badge } from 'antd'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

export type IngestionSection = 'overview' | 'activity' | 'documents' | 'errors' | 'system'

interface NavItem {
  key: IngestionSection
  label: string
  icon: ReactNode
  badge?: number
}

interface IngestionSectionNavProps {
  failedCount?: number
}

export const INGESTION_SECTION_LABELS: Record<IngestionSection, string> = {
  overview: 'Overview',
  activity: 'Activity',
  documents: 'Documents',
  errors: 'Failures',
  // Combines the former separate Health + Sync tabs — one place for
  // "is everything connected and is auto-ingestion running" (dashboard
  // cleanup pass: two tabs answering closely related questions read as
  // one too many).
  system: 'System',
}

const NAV_ITEMS: Omit<NavItem, 'badge'>[] = [
  { key: 'overview', label: INGESTION_SECTION_LABELS.overview, icon: <AdminAppsNavIcon /> },
  { key: 'activity', label: INGESTION_SECTION_LABELS.activity, icon: <AdminListNavIcon /> },
  { key: 'documents', label: INGESTION_SECTION_LABELS.documents, icon: <AdminFindNavIcon /> },
  { key: 'errors', label: INGESTION_SECTION_LABELS.errors, icon: <AdminWarningNavIcon /> },
  { key: 'system', label: INGESTION_SECTION_LABELS.system, icon: <AdminHealthNavIcon /> },
]

function isSection(value: string | null): value is IngestionSection {
  return NAV_ITEMS.some((item) => item.key === value)
}

export function getIngestionSection(searchParams: URLSearchParams): IngestionSection {
  const tab = searchParams.get('tab')
  return isSection(tab) ? tab : 'overview'
}

export default function IngestionSectionNav({ failedCount = 0 }: IngestionSectionNavProps) {
  const [searchParams] = useSearchParams()
  const active = getIngestionSection(searchParams)

  return (
    <nav className="flex flex-col gap-1 px-3 py-5" aria-label="Ingestion sections">
      {NAV_ITEMS.map((item) => {
        const selected = active === item.key
        const showBadge = item.key === 'errors' && failedCount > 0
        return (
          <Link
            key={item.key}
            to={`/admin/ingestion?tab=${item.key}`}
            className={`admin-section-nav-link${selected ? ' is-active' : ''}`}
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="flex-1 truncate">{item.label}</span>
            {showBadge && (
              <Badge count={failedCount} size="small" color="#cf1322" overflowCount={999} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
