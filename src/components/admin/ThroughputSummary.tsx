import { Col, Row, Statistic, Typography } from 'antd'
import type { BulkProgressSnapshot, IngestionOverview } from '../../api/types/admin'
import { ADMIN_EMPTY, ADMIN_STAT_TITLE, ADMIN_STAT_VALUE } from '../../config/adminStyles'
import { ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import AdminCard from './AdminCard'

const { Text } = Typography

interface ThroughputSummaryProps {
  bulk: BulkProgressSnapshot | null
  counts?: IngestionOverview['counts']
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ADMIN_EMPTY
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

export default function ThroughputSummary({ bulk, counts }: ThroughputSummaryProps) {
  const inFlight =
    (counts?.preparing ?? 0) +
    (counts?.staged ?? 0) +
    (counts?.indexing ?? 0) +
    (counts?.discovered ?? 0)

  if (!bulk || bulk.job_state === 'idle') {
    return (
      <AdminCard title="Throughput" className="admin-system-card">
        <Text className={ADMIN_TEXT_MUTED}>
          {inFlight > 0
            ? `${inFlight} document(s) still moving through the RAG pipeline.`
            : 'No active bulk job. Start ingesting to begin.'}
        </Text>
      </AdminCard>
    )
  }

  if (bulk.job_state === 'completed' && inFlight > 0 && bulk.documents_per_second == null) {
    return (
      <AdminCard title="Throughput" className="admin-system-card">
        <Text className={ADMIN_TEXT_MUTED}>
          Bulk crawl finished. {inFlight} document(s) still preparing or indexing — watch Progress
          counts above.
        </Text>
      </AdminCard>
    )
  }

  if (bulk.job_state === 'failed') {
    return (
      <AdminCard title="Throughput" className="admin-system-card">
        <Text className={ADMIN_TEXT_MUTED}>
          Bulk crawl failed{bulk.job_error ? `: ${bulk.job_error}` : '.'}
        </Text>
      </AdminCard>
    )
  }

  const rate = bulk.documents_per_second

  return (
    <AdminCard title="Throughput" className="admin-system-card">
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
