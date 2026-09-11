import { List, Typography } from 'antd'
import type { IngestionErrorGroup } from '../../api/types/admin'
import { ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import AdminCard from './AdminCard'

const { Text } = Typography

interface FailureSummaryProps {
  groups: IngestionErrorGroup[]
  totalFailed: number
}

export default function FailureSummary({ groups, totalFailed }: FailureSummaryProps) {
  if (totalFailed === 0) {
    return (
      <AdminCard title="Failures">
        <Text className={ADMIN_TEXT_MUTED}>No failed documents</Text>
      </AdminCard>
    )
  }

  return (
    <AdminCard title="Failures">
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
    </AdminCard>
  )
}
