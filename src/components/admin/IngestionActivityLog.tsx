import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Space, Statistic, Tag, Timeline, Typography } from 'antd'
import { useMemo } from 'react'
import type { AdminDocumentSummary, IngestionOverview } from '../../api/types/admin'
import { ADMIN_CARD_CLASS } from '../../config/adminStyles'
import { mergeActivityFeed, type ActivityLevel } from '../../utils/activityLog'
import { formatDateTime } from '../../utils/lifecycle'

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
    <div className="space-y-5">
      <Card className={ADMIN_CARD_CLASS} size="small">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Space wrap size="middle">
            <Statistic title="In flight" value={inFlight} valueStyle={{ fontSize: 20 }} />
            <Statistic
              title="Indexing"
              value={counts.indexing}
              valueStyle={{ fontSize: 20, color: '#d48806' }}
            />
            <Statistic
              title="Ready"
              value={counts.ready}
              valueStyle={{ fontSize: 20, color: '#389e0d' }}
            />
            <Statistic
              title="Failed"
              value={counts.failed}
              valueStyle={{ fontSize: 20, color: counts.failed ? '#cf1322' : undefined }}
            />
          </Space>
          {onRefresh && (
            <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
              Refresh
            </Button>
          )}
        </div>
        <Text type="secondary" className="block mt-3 text-xs">
          Live activity synthesized from document pipeline timestamps — not raw server logs.
          Polls every few seconds while this tab is open.
        </Text>
      </Card>

      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>Activity log</span>
            <Tag>{entries.length} events</Tag>
          </Space>
        }
        className={ADMIN_CARD_CLASS}
      >
        {entries.length === 0 ? (
          <Empty description="No recent ingestion activity" />
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
                        className="text-left font-medium text-[#0084ff] hover:underline bg-transparent border-0 p-0 cursor-pointer"
                        onClick={() => onSelectDocument(entry.docId!)}
                      >
                        {entry.headline}
                      </button>
                    ) : (
                      <Text strong className="text-sm">
                        {entry.headline}
                      </Text>
                    )}
                    <Text type="secondary" className="text-xs whitespace-nowrap">
                      {formatDateTime(entry.at)}
                    </Text>
                  </div>
                  {entry.detail && (
                    <Text type="secondary" className="block text-xs mt-0.5 break-words">
                      {entry.detail}
                    </Text>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  )
}
