import { Card, Descriptions, Tag } from 'antd'
import type { AdminHealthStatus } from '../../api/types/admin'

interface SystemHealthProps {
  health: AdminHealthStatus
  circuitOpen?: boolean
}

function statusTag(value: string) {
  if (value === 'ok') return <Tag color="success">HEALTHY</Tag>
  if (value === 'unavailable') return <Tag color="error">DOWN</Tag>
  return <Tag color="default">UNKNOWN</Tag>
}

export default function SystemHealth({ health, circuitOpen = false }: SystemHealthProps) {
  const degraded =
    health.logicaldoc !== 'ok' ||
    health.rag_engine !== 'ok' ||
    health.minio !== 'ok' ||
    circuitOpen

  return (
    <Card title="System Health" size="small" className="shadow-sm">
      {degraded && (
        <Tag color="warning" className="mb-3">
          DEGRADED
        </Tag>
      )}
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Adapter">{statusTag(health.adapter)}</Descriptions.Item>
        <Descriptions.Item label="LogicalDOC">{statusTag(health.logicaldoc)}</Descriptions.Item>
        <Descriptions.Item label="RAG Engine">{statusTag(health.rag_engine)}</Descriptions.Item>
        <Descriptions.Item label="MinIO">{statusTag(health.minio)}</Descriptions.Item>
        <Descriptions.Item label="RabbitMQ consumer">
          {health.mq_consumer_configured ? (
            <Tag color="success">Configured</Tag>
          ) : (
            <Tag color="warning">Poll fallback</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Temporal">
          {health.temporal_enabled ? (
            <Tag color="processing">Enabled</Tag>
          ) : (
            <Tag>Legacy pipeline</Tag>
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
