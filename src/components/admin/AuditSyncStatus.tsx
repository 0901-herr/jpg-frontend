import { Alert, Card, Descriptions, Tag } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'
import { ADMIN_CARD_CLASS } from '../../config/adminStyles'
import { formatDateTime, formatRelativeTime } from '../../utils/lifecycle'

interface AuditSyncStatusProps {
  overview: IngestionOverview
}

const STALE_MINUTES = 10

export default function AuditSyncStatus({ overview }: AuditSyncStatusProps) {
  const pollAt = overview.last_audit_poll_at
  const stale =
    overview.audit_sync_enabled &&
    pollAt != null &&
    Date.now() - new Date(pollAt).getTime() > STALE_MINUTES * 60 * 1000

  return (
    <Card title="LogicalDOC Incremental Sync" size="small" className={ADMIN_CARD_CLASS}>
      {!overview.audit_sync_enabled ? (
        <Tag>Disabled</Tag>
      ) : (
        <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Enabled">Yes</Descriptions.Item>
            <Descriptions.Item label="Last poll">
              {pollAt ? `${formatRelativeTime(pollAt)} (${formatDateTime(pollAt)})` : 'Never'}
            </Descriptions.Item>
            <Descriptions.Item label="Last history ID">
              {overview.last_history_id ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Last event time">
              {formatDateTime(overview.last_history_at)}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={stale ? 'warning' : 'success'}>{stale ? 'Stale' : 'Healthy'}</Tag>
            </Descriptions.Item>
          </Descriptions>
          {stale && (
            <Alert
              className="mt-3"
              type="warning"
              showIcon
              message={`Audit sync has not completed successfully for ${STALE_MINUTES}+ minutes`}
            />
          )}
        </>
      )}
    </Card>
  )
}
