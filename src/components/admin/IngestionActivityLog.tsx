import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Statistic, Tag, Timeline, Typography } from 'antd'
import { useMemo } from 'react'
import type { AdminDocumentSummary, IngestionOverview } from '../../api/types/admin'
import { ADMIN_STACK_SPACE, ADMIN_STAT_TITLE, ADMIN_STAT_VALUE } from '../../config/adminStyles'
import { mergeActivityFeed, type ActivityLevel } from '../../utils/activityLog'
import { formatDateTime } from '../../utils/lifecycle'
import { ADMIN_TEXT_BODY, ADMIN_TEXT_LINK, ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import AdminCard from './AdminCard'

const { Text } = Typography

interface IngestionActivityLogProps {
  overview: IngestionOverview
  documents: AdminDocumentSummary[]
  loading?: boolean
  onRefresh?: () => void
  onSelectDocument?: (docId: string) => void
}

function timelineColor(level: ActivityLevel): 'green' | 'red' | 'blue' | 'gray' {
  switch (level) {
    case 'success':
      return 'green'
    case 'error':
      return 'red'
    case 'warning':
      return 'blue'
    default:
      return 'gray'
  }
}

export default function IngestionActivityLog({
  overview,
  documents,
  loading,
  onRefresh,
  onSelectDocument,
}: IngestionActivityLogProps) {
  const entries = useMemo(() => mergeActivityFeed(documents), [documents])

  const { counts } = overview
  const inFlight =
    counts.preparing + counts.staged + counts.indexing + counts.discovered

  return (
    <div className={ADMIN_STACK_SPACE}>
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Space wrap size="large">
            <Statistic
              title="In flight"
              value={inFlight}
              className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
            />
            <Statistic
              title="Indexing"
              value={counts.indexing}
              valueStyle={{ color: '#d48806' }}
              className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
            />
            <Statistic
              title="Ready"
              value={counts.ready}
              valueStyle={{ color: '#389e0d' }}
              className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
            />
            <Statistic
              title="Failed"
              value={counts.failed}
              valueStyle={{ color: counts.failed ? '#cf1322' : undefined }}
              className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
            />
          </Space>
          {onRefresh && (
            <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
              Refresh
            </Button>
          )}
        </div>
      </AdminCard>

      <AdminCard
        title={
          <Space size="small">
            <FileTextOutlined />
            <span>Activity log</span>
            <Tag className="!m-0">{entries.length}</Tag>
          </Space>
        }
      >
        {entries.length === 0 ? (
          <Empty description="No recent activity" />
        ) : (
          <Timeline
            items={entries.map((entry) => ({
              color: timelineColor(entry.level),
              children: (
                <div className="min-w-0 pr-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {entry.docId && onSelectDocument ? (
                      <button
                        type="button"
                        className={ADMIN_TEXT_LINK}
                        onClick={() => onSelectDocument(entry.docId!)}
                      >
                        {entry.headline}
                      </button>
                    ) : (
                      <Text strong className={ADMIN_TEXT_BODY}>
                        {entry.headline}
                      </Text>
                    )}
                    <Text className={`${ADMIN_TEXT_MUTED} whitespace-nowrap`}>
                      {formatDateTime(entry.at)}
                    </Text>
                  </div>
                  {entry.detail && (
                    <Text className={`block mt-0.5 break-words ${ADMIN_TEXT_MUTED}`}>
                      {entry.detail}
                    </Text>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </AdminCard>
    </div>
  )
}
