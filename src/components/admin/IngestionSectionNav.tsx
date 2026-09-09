import {
  AlertOutlined,
  AppstoreOutlined,
  CloudSyncOutlined,
  FileSearchOutlined,
  HeartOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Badge, Typography } from 'antd'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { sidebarNav } from '../../styles/theme'

const { Text } = Typography

export type IngestionSection = 'overview' | 'activity' | 'documents' | 'errors' | 'health' | 'sync'

interface NavItem {
  key: IngestionSection
  label: string
  icon: ReactNode
  badge?: number
}

interface IngestionSectionNavProps {
  failedCount?: number
}

const NAV_ITEMS: Omit<NavItem, 'badge'>[] = [
  { key: 'overview', label: 'Overview', icon: <AppstoreOutlined /> },
  { key: 'activity', label: 'Activity log', icon: <UnorderedListOutlined /> },
  { key: 'documents', label: 'Documents', icon: <FileSearchOutlined /> },
  { key: 'errors', label: 'Failures', icon: <AlertOutlined /> },
  { key: 'health', label: 'System health', icon: <HeartOutlined /> },
  { key: 'sync', label: 'Sync & reconcile', icon: <CloudSyncOutlined /> },
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
    <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Ingestion sections">
      <Text type="secondary" className="px-3 pb-2 text-xs uppercase tracking-wide">
        Sections
      </Text>
      {NAV_ITEMS.map((item) => {
        const selected = active === item.key
        const showBadge = item.key === 'errors' && failedCount > 0
        return (
          <Link
            key={item.key}
            to={`/admin/ingestion?tab=${item.key}`}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium no-underline ${sidebarNav.row} ${
              selected
                ? `${sidebarNav.active} text-[#0d0d0d]`
                : `${sidebarNav.idle} text-[#676767] hover:text-[#0d0d0d]`
            }`}
          >
            <span className={selected ? 'text-[#0084ff]' : 'text-[#676767]'}>{item.icon}</span>
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
