import { Card, Col, Progress, Row, Statistic, Typography } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'
import { ADMIN_CARD_CLASS } from '../../config/adminStyles'
import { computeProgressLabel } from '../../utils/lifecycle'

const { Text } = Typography

interface ProgressSummaryProps {
  overview: IngestionOverview
}

export default function ProgressSummary({ overview }: ProgressSummaryProps) {
  const { counts, bulk_progress: bulk } = overview
  const traversalComplete =
    bulk?.traversal_status === 'completed' || bulk?.traversal_status === 'COMPLETED'
  const discoveredSoFar =
    bulk?.total_discovered ??
    counts.discovered + counts.staged + counts.preparing + counts.indexing + counts.ready
  const progress = computeProgressLabel(
    counts.ready,
    bulk?.total_known ?? null,
    discoveredSoFar,
    traversalComplete,
  )

  const queued = counts.discovered + counts.staged

  return (
    <Card title="Bulk Ingestion Progress" className={ADMIN_CARD_CLASS}>
      <div className="mb-4 space-y-2">
        <Text>{progress.label}</Text>
        {progress.percent != null && (
          <Progress percent={progress.percent} status={overview.overall_state === 'PAUSED' ? 'exception' : 'active'} />
        )}
        {!traversalComplete && bulk?.job_state === 'running' && (
          <Text type="secondary" className="block text-sm">
            Folder traversal in progress — corpus total not final yet.
          </Text>
        )}
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Discovered" value={discoveredSoFar} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Queued" value={queued} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Preparing" value={counts.preparing} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Staged" value={counts.staged} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Indexing" value={counts.indexing} valueStyle={{ color: '#d48806' }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Ready" value={counts.ready} valueStyle={{ color: '#389e0d' }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Failed" value={counts.failed} valueStyle={{ color: '#cf1322' }} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Deleted" value={counts.deleted} />
        </Col>
      </Row>
    </Card>
  )
}
