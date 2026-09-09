import { Card, List, Typography } from 'antd'
import type { IngestionErrorGroup } from '../../api/types/admin'
import { ADMIN_CARD_CLASS } from '../../config/adminStyles'

const { Text } = Typography

interface FailureSummaryProps {
  groups: IngestionErrorGroup[]
  totalFailed: number
}

export default function FailureSummary({ groups, totalFailed }: FailureSummaryProps) {
  if (totalFailed === 0) {
    return (
      <Card title="Failure Summary" size="small" className={ADMIN_CARD_CLASS}>
        <Text type="secondary">No failed documents</Text>
      </Card>
    )
  }

  return (
    <Card title="Failure Summary" size="small" className={ADMIN_CARD_CLASS}>
      <List
        size="small"
        dataSource={groups}
        renderItem={(item) => (
          <List.Item>
            <Text>{item.error_code ?? 'unknown'}</Text>
            <Text strong>{item.count.toLocaleString()}</Text>
          </List.Item>
        )}
      />
    </Card>
  )
}
