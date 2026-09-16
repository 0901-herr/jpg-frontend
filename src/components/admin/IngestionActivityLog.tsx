import { AdminDescriptionIcon } from '../../icons/admin'
import { Alert, Empty, Space, Tag, Timeline, Typography } from 'antd'
import { useMemo } from 'react'
import type { AdminDocumentSummary, IngestionActivityItem, IngestionOverview } from '../../api/types/admin'
import { ADMIN_STACK_SPACE } from '../../config/adminStyles'
import {
  formatActivityTime,
  groupActivityByDay,
  mergeActivityFeed,
  type ActivityKind,
  type ActivityLevel,
} from '../../utils/activityLog'
import { ADMIN_TEXT_BODY, ADMIN_TEXT_LINK, ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import AdminCard from './AdminCard'
import AdminRefreshButton from './AdminRefreshButton'

const { Text } = Typography

interface IngestionActivityLogProps {
  overview: IngestionOverview
  documents: AdminDocumentSummary[]
  systemEvents?: IngestionActivityItem[]
  loading?: boolean
  onRefresh?: () => void
  onSelectDocument?: (docId: string) => void
}

function timelineColor(level: ActivityLevel): string {
  switch (level) {
    case 'success':
      return 'var(--admin-success)'
    case 'error':
      return 'var(--admin-danger)'
    case 'warning':
      return 'var(--admin-warning)'
    default:
      return 'var(--admin-text-muted)'
  }
}

const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  discovery: 'Discovery',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  sync: 'Sync',
  action: 'Action',
  system: 'System',
}

export default function IngestionActivityLog({
  overview,
  documents,
  systemEvents = [],
  loading,
  onRefresh,
  onSelectDocument,
}: IngestionActivityLogProps) {
  const entries = useMemo(
    () =>
      mergeActivityFeed(
        documents,
        systemEvents.map((event) => ({
          id: event.id,
          at: event.at,
          level: event.level,
          headline: event.headline,
          detail: event.detail,
          category: event.category,
          action: event.action,
        })),
        overview.bulk_progress,
      ),
    [documents, systemEvents, overview.bulk_progress],
  )

  const dayGroups = useMemo(() => groupActivityByDay(entries), [entries])

  const bulkFailed = overview.bulk_progress?.job_state === 'failed'
  const bulkError = overview.bulk_progress?.job_error

  return (
    <div className={ADMIN_STACK_SPACE}>
      {bulkFailed && (
        <Alert
          type="error"
          showIcon
          message="Bulk crawl failed"
          description={bulkError ?? 'Check the activity log below for details.'}
        />
      )}

      <AdminCard
        className="admin-activity-card"
        title={
          <Space size="small">
            <AdminDescriptionIcon />
            <span>Activity log</span>
            <Tag className="!m-0">{entries.length}</Tag>
          </Space>
        }
        extra={
          onRefresh ? (
            <AdminRefreshButton onClick={onRefresh} loading={loading} />
          ) : null
        }
      >
        {entries.length === 0 ? (
          <Empty description="No recent activity" />
        ) : (
          <div className="admin-activity-log">
            {dayGroups.map((group) => (
              <section key={group.dayKey} className="admin-activity-day-group">
                <h3 className="admin-activity-day-label">{group.label}</h3>
                <Timeline
                  className="admin-activity-day-timeline"
                  items={group.entries.map((entry) => ({
                    color: timelineColor(entry.level),
                    children: (
                      <div className="min-w-0 pr-2">
                        <div className="admin-activity-entry-header">
                          <Text className={`${ADMIN_TEXT_MUTED} admin-activity-time`}>
                            {formatActivityTime(entry.at)}
                          </Text>
                          <Tag
                            className={`admin-activity-kind admin-activity-kind--${entry.kind}`}
                          >
                            {ACTIVITY_KIND_LABELS[entry.kind]}
                          </Tag>
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
                        </div>
                        {entry.detail && (
                          <Text className={`admin-activity-detail break-words ${ADMIN_TEXT_MUTED}`}>
                            {entry.detail}
                          </Text>
                        )}
                      </div>
                    ),
                  }))}
                />
              </section>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  )
}
