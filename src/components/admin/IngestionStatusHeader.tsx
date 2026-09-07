import { Alert, Space, Tag, Typography } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'

const { Title, Text } = Typography

interface IngestionStatusHeaderProps {
  overview: IngestionOverview
}

function overallColor(state: string): string {
  if (state === 'RUNNING') return 'success'
  if (state === 'PAUSED' || state === 'PARTIAL') return 'warning'
  if (state === 'DEGRADED' || state === 'ERROR') return 'error'
  return 'default'
}

export default function IngestionStatusHeader({ overview }: IngestionStatusHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Title level={3} className="!mb-1">
            Ingestion Operations
          </Title>
          <Text type="secondary">Administrator dashboard for LogicalDOC → RAG pipeline</Text>
        </div>
        <Space wrap>
          <Tag color={overallColor(overview.overall_state)} className="!text-sm !px-3 !py-1">
            Overall: {overview.overall_state}
          </Tag>
          <Tag color={overview.discovery_state === 'PAUSED' ? 'warning' : 'success'}>
            Discovery: {overview.discovery_state}
          </Tag>
          <Tag color={overview.ingestion_state === 'PAUSED' ? 'warning' : 'success'}>
            Ingestion: {overview.ingestion_state}
          </Tag>
          {overview.circuit_open && <Tag color="error">RAG circuit open</Tag>}
          {overview.temporal_enabled && <Tag color="processing">Temporal</Tag>}
        </Space>
      </div>
      {overview.circuit_open && (
        <Alert
          type="warning"
          showIcon
          message="RAG circuit breaker is open — new workflow scheduling is paused after consecutive failures."
        />
      )}
    </div>
  )
}
