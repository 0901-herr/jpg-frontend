import { Col, Row, Statistic, Typography } from 'antd'
import type { BulkProgressSnapshot } from '../../api/types/admin'
import { ADMIN_EMPTY, ADMIN_STAT_TITLE, ADMIN_STAT_VALUE } from '../../config/adminStyles'
import { ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import AdminCard from './AdminCard'

const { Text } = Typography

interface ThroughputSummaryProps {
  bulk: BulkProgressSnapshot | null
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ADMIN_EMPTY
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

export default function ThroughputSummary({ bulk }: ThroughputSummaryProps) {
  if (!bulk || bulk.job_state === 'idle') {
    return (
      <AdminCard title="Throughput">
        <Text className={ADMIN_TEXT_MUTED}>No active bulk job.</Text>
      </AdminCard>
    )
  }

  const rate = bulk.documents_per_second

  return (
    <AdminCard title="Throughput">
      <Row gutter={[20, 20]}>
        <Col span={8}>
          <Statistic
            title="Ready rate"
            value={rate != null ? rate * 60 : undefined}
            precision={1}
            suffix="/ min"
            className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Queue depth"
            value={bulk.total_staged_for_rag}
            className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="ETA"
            value={formatEta(bulk.estimated_seconds_remaining)}
            className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
          />
        </Col>
      </Row>
    </AdminCard>
  )
}
