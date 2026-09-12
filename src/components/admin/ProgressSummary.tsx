import { Col, Progress, Row, Statistic, Typography } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'
import { ADMIN_STAT_TITLE, ADMIN_STAT_VALUE, ADMIN_TEXT_BODY, ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import { computeProgressLabel } from '../../utils/lifecycle'
import AdminCard from './AdminCard'

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
    <AdminCard title="Progress">
      <div className="mb-5 space-y-2">
        <Text className={ADMIN_TEXT_BODY}>{progress.label}</Text>
        {progress.percent != null && (
          <Progress
            percent={progress.percent}
            status={overview.overall_state === 'PAUSED' ? 'exception' : 'active'}
            strokeColor="#0084ff"
          />
        )}
        {!traversalComplete && bulk?.job_state === 'running' && (
          <Text className={`block ${ADMIN_TEXT_MUTED}`}>
            Folder traversal in progress. Corpus total may change.
          </Text>
        )}
      </div>
      <Row gutter={[20, 20]}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Discovered" value={discoveredSoFar} className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Queued" value={queued} className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Preparing" value={counts.preparing} className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Staged" value={counts.staged} className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic
            title="Indexing"
            value={counts.indexing}
            valueStyle={{ color: '#d48806' }}
            className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
          />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic
            title="Ready"
            value={counts.ready}
            valueStyle={{ color: '#389e0d' }}
            className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
          />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic
            title="Failed"
            value={counts.failed}
            valueStyle={{ color: '#cf1322' }}
            className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
          />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic title="Deleted" value={counts.deleted} className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`} />
        </Col>
      </Row>
    </AdminCard>
  )
}
