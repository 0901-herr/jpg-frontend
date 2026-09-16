import { Descriptions, Tag } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'
import { formatDateTime } from '../../utils/lifecycle'
import AdminCard from './AdminCard'

interface ReconciliationStatusProps {
  overview: IngestionOverview
}

export default function ReconciliationStatus({ overview }: ReconciliationStatusProps) {
  const lastRun = overview.last_reconciliation_at

  return (
    <AdminCard title="Reconciliation" className="admin-system-status-card">
      <Descriptions column={1} size="small" className="admin-system-descriptions">
        <Descriptions.Item label="Last run">{formatDateTime(lastRun)}</Descriptions.Item>
        <Descriptions.Item label="Status">
          {lastRun ? <Tag color="success">Completed</Tag> : <Tag>Not run yet</Tag>}
        </Descriptions.Item>
      </Descriptions>
    </AdminCard>
  )
}
