import { Card, Descriptions, Tag, Typography } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'
import { ADMIN_CARD_CLASS } from '../../config/adminStyles'
import { formatDateTime } from '../../utils/lifecycle'

const { Text } = Typography

interface ReconciliationStatusProps {
  overview: IngestionOverview
}

export default function ReconciliationStatus({ overview }: ReconciliationStatusProps) {
  const lastRun = overview.last_reconciliation_at

  return (
    <Card title="Reconciliation" size="small" className={ADMIN_CARD_CLASS}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Last run">{formatDateTime(lastRun)}</Descriptions.Item>
        <Descriptions.Item label="Status">
          {lastRun ? <Tag color="success">Completed</Tag> : <Tag>Not run yet</Tag>}
        </Descriptions.Item>
      </Descriptions>
      <Text type="secondary" className="block mt-3 text-xs">
        Detailed scan/repair counts are not exposed by the API yet. Reconciliation runs on a
        scheduled interval when enabled.
      </Text>
    </Card>
  )
}
