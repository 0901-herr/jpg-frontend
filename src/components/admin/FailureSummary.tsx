import { Card, List, Typography } from 'antd'
import type { IngestionErrorGroup } from '../../api/types/admin'

const { Text } = Typography

interface FailureSummaryProps {
  groups: IngestionErrorGroup[]
  totalFailed: number
}

export default function FailureSummary({ groups, totalFailed }: FailureSummaryProps) {
  if (totalFailed === 0) {
    return (
      <Card title="Failure Summary" size="small" className="shadow-sm">
        <Text type="secondary">No failed documents</Text>
      </Card>
    )
  }

  return (
    <Card title="Failure Summary" size="small" className="shadow-sm">
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
