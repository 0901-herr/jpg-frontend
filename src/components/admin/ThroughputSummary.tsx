import { Card, Col, Row, Statistic, Typography } from 'antd'
import type { BulkProgressSnapshot } from '../../api/types/admin'

const { Text } = Typography

interface ThroughputSummaryProps {
  bulk: BulkProgressSnapshot | null
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

export default function ThroughputSummary({ bulk }: ThroughputSummaryProps) {
  if (!bulk || bulk.job_state === 'idle') {
    return (
      <Card title="Throughput" size="small" className="shadow-sm">
        <Text type="secondary">No active bulk job — throughput metrics unavailable</Text>
      </Card>
    )
  }

  const rate = bulk.documents_per_second

  return (
    <Card title="Throughput" size="small" className="shadow-sm">
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Statistic
            title="Ready rate"
            value={rate != null ? rate * 60 : undefined}
            precision={1}
            suffix="/ min"
          />
        </Col>
        <Col span={8}>
          <Statistic title="Queue depth (staged)" value={bulk.total_staged_for_rag} />
        </Col>
        <Col span={8}>
          <Statistic title="ETA" value={formatEta(bulk.estimated_seconds_remaining)} />
        </Col>
      </Row>
      <Text type="secondary" className="block mt-3 text-xs">
        Rates derived from active bulk job only. Historical throughput charts not available yet.
      </Text>
    </Card>
  )
}
