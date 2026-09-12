import { Alert, Descriptions, Tag } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'
import { ADMIN_EMPTY } from '../../config/adminStyles'
import { formatDateTime, formatRelativeTime } from '../../utils/lifecycle'
import AdminCard from './AdminCard'

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
    <AdminCard title="LogicalDOC sync">
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
              {overview.last_history_id ?? ADMIN_EMPTY}
            </Descriptions.Item>
            <Descriptions.Item label="Last event">
              {formatDateTime(overview.last_history_at)}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={stale ? 'warning' : 'success'}>{stale ? 'Stale' : 'Healthy'}</Tag>
            </Descriptions.Item>
          </Descriptions>
          {stale && (
            <Alert
              className="mt-4"
              type="warning"
              showIcon
              message={`Audit sync stale for ${STALE_MINUTES}+ minutes`}
            />
          )}
        </>
      )}
    </AdminCard>
  )
}
