import { AdminPauseIcon, AdminPlayIcon } from '../../icons/admin'
import { App, Button, Col, Popover, Progress, Row, Statistic, Tooltip, Typography } from 'antd'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { IngestionOverview } from '../../api/types/admin'
import { pausePipeline, resumeAllIngestion } from '../../api/admin'
import {
  ADMIN_STAT_TITLE,
  ADMIN_STAT_VALUE,
  ADMIN_TEXT_MUTED,
} from '../../config/adminStyles'
import { useInvalidateAdminQueries } from '../../hooks/useInvalidateAdminQueries'
import { formatEta, formatLastUpdate } from '../../utils/adminFormat'
import { computeProgressLabel } from '../../utils/lifecycle'
import { buildProgressMetrics } from '../../utils/progressMetrics'
import {
  pipelineCorpusTotal,
  pipelineGatesPaused,
  pipelinePrimaryAction,
  pipelineProgressIntro,
  shouldShowProgressBar,
} from '../../utils/pipelineStatus'
import AdminCard from './AdminCard'
import AdminConfirmDialog from './AdminConfirmDialog'
import AdminRefreshButton from './AdminRefreshButton'

const { Text } = Typography

interface PipelineProgressCardProps {
  overview: IngestionOverview
  dataUpdatedAt?: number
  isRefreshing?: boolean
  onRefresh?: () => void
}

interface CapacityMeterProps {
  label: string
  value: number
  capacity: number
  description: string
  backpressured?: boolean | null
}

function CapacityMeter({
  label,
  value,
  capacity,
  description,
  backpressured,
}: CapacityMeterProps) {
  const percent = Math.min(Math.round((value / capacity) * 100), 100)
  const nearCapacity = percent >= 80
  const state = backpressured
    ? 'Draining'
    : percent >= 100
      ? 'At capacity'
      : nearCapacity
        ? 'Near capacity'
        : 'Available'

  return (
    <Popover
      title={label}
      content={<p className="admin-capacity-popover-description">{description}</p>}
      trigger={['hover', 'focus']}
      placement="top"
      rootClassName="admin-capacity-popover"
    >
      <div className="admin-capacity-meter" tabIndex={0}>
        <div className="admin-capacity-meter-heading">
          <Text>{label}</Text>
          <Text className={nearCapacity || backpressured ? 'admin-capacity-warning' : ADMIN_TEXT_MUTED}>
            {value.toLocaleString()} / {capacity.toLocaleString()}
          </Text>
        </div>
        <Progress
          percent={percent}
          showInfo={false}
          size="small"
          strokeColor={
            nearCapacity || backpressured ? 'var(--admin-warning)' : 'var(--admin-success)'
          }
          railColor="var(--admin-border)"
        />
        <Text className={nearCapacity || backpressured ? 'admin-capacity-warning' : ADMIN_TEXT_MUTED}>
          {state}
        </Text>
      </div>
    </Popover>
  )
}

export default function PipelineProgressCard({
  overview,
  dataUpdatedAt,
  isRefreshing,
  onRefresh,
}: PipelineProgressCardProps) {
  const { message } = App.useApp()
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false)
  const invalidate = useInvalidateAdminQueries()
  const intro = pipelineProgressIntro(overview)
  const primaryAction = pipelinePrimaryAction(overview)
  const gatesPaused = pipelineGatesPaused(overview)

  const startMutation = useMutation({
    mutationFn: () => resumeAllIngestion(),
    onSuccess: (result) => {
      if (result.bulk_started) {
        message.success('Document scan started.')
      } else if (result.catch_up_scheduled) {
        message.warning('Catch-up scheduled.', 6)
      } else {
        message.success('Pipeline started.')
      }
      invalidate()
    },
    onError: (err: Error) => message.error(`Start ingesting failed: ${err.message}`, 8),
  })

  const resumeMutation = useMutation({
    mutationFn: () => resumeAllIngestion(),
    onSuccess: () => {
      message.success('Pipeline resumed.')
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const pauseMutation = useMutation({
    mutationFn: () => pausePipeline(),
    onSuccess: () => {
      message.success('Pipeline paused.')
      invalidate()
    },
    onError: (err: Error) => message.error(`Pause failed: ${err.message}`),
  })

  const actionPending =
    startMutation.isPending || resumeMutation.isPending || pauseMutation.isPending

  const { counts, bulk_progress: bulk } = overview
  const traversalComplete =
    bulk?.traversal_status === 'completed' || bulk?.traversal_status === 'COMPLETED'
  const discoveredSoFar = pipelineCorpusTotal(overview)
  const queued = counts.discovered + counts.staged
  const progress = computeProgressLabel(
    counts.ready,
    bulk?.total_known ?? null,
    discoveredSoFar,
    traversalComplete,
  )
  const metrics = buildProgressMetrics({ overview, discoveredSoFar, queued })
  const showProgress = shouldShowProgressBar(overview) && progress.percent != null
  const lastUpdate = dataUpdatedAt != null ? formatLastUpdate(dataUpdatedAt) : null
  const showThroughput =
    bulk != null &&
    bulk.job_state === 'running' &&
    bulk.documents_per_second != null
  const capacityItems: CapacityMeterProps[] =
    bulk
      ? [
          {
            label: 'Discovered from LogicalDOC',
            value: bulk.total_preparing,
            capacity: bulk.preparing_capacity,
            description:
              'Found in LogicalDOC and still being prepared locally. Discovery slows if this backlog fills up.',
            backpressured: bulk.discovery_backpressured,
          },
          {
            label: 'Ready for indexing',
            value: bulk.total_staged_for_rag,
            capacity: bulk.staged_capacity,
            description:
              'Prepared and waiting to be sent for indexing. Preparation slows if this queue fills up.',
            backpressured: bulk.preparation_backpressured,
          },
          {
            label: 'Indexing',
            value: bulk.current_inflight ?? bulk.total_submitted,
            capacity: bulk.target_inflight,
            description:
              'Documents currently being indexed. New documents wait here when all indexing slots are in use.',
            backpressured: bulk.submission_backpressured,
          },
        ].flatMap((item) =>
          typeof item.capacity === 'number' && item.capacity > 0
            ? [{ ...item, capacity: item.capacity }]
            : [],
        )
      : []
  const backpressureMessage = bulk?.discovery_backpressured
    ? 'Discovery is waiting while the LogicalDOC backlog drains.'
    : bulk?.preparation_backpressured
      ? 'Preparation is waiting while the ready-for-indexing queue drains.'
      : bulk?.submission_backpressured
        ? 'Indexing is at capacity. Queued documents will start as slots free up.'
        : null

  function confirmPause() {
    setPauseConfirmOpen(true)
  }

  async function pauseConfirmed() {
    try {
      await pauseMutation.mutateAsync()
      setPauseConfirmOpen(false)
    } catch {
      // Mutation error messaging is handled by onError.
    }
  }

  function renderActionButton() {
    if (primaryAction === 'pause') {
      return (
        <Button
          size="small"
          icon={<AdminPauseIcon />}
          loading={actionPending}
          aria-label="Pause pipeline"
          title="Pause pipeline"
          className="admin-control-btn admin-control-btn--primary shrink-0"
          onClick={confirmPause}
        />
      )
    }

    const label = primaryAction === 'resume' ? 'Resume pipeline' : 'Start ingesting'
    const onClick = () => {
      if (primaryAction === 'resume') resumeMutation.mutate()
      else startMutation.mutate()
    }

    return (
      <Button
        size="small"
        icon={<AdminPlayIcon />}
        loading={actionPending}
        aria-label={label}
        title={label}
        className="admin-control-btn admin-control-btn--primary shrink-0"
        onClick={onClick}
      />
    )
  }

  return (
    <>
      <AdminCard>
      <div className="admin-pipeline-progress-lead mb-6">
        <div className="admin-pipeline-progress-copy">
          <h3 className="admin-pipeline-progress-title">Pipeline progress</h3>
          <Text className={`admin-pipeline-progress-intro ${ADMIN_TEXT_MUTED}`}>{intro}</Text>
        </div>
        <div className="admin-pipeline-progress-action">{renderActionButton()}</div>
      </div>

      {showProgress && (
        <div className="mb-5 space-y-2">
          {progress.label ? <Text className={ADMIN_TEXT_MUTED}>{progress.label}</Text> : null}
          <Progress
            percent={progress.percent ?? 0}
            status={gatesPaused ? 'exception' : 'active'}
            strokeColor="var(--admin-accent)"
            showInfo={Boolean(progress.label)}
          />
        </div>
      )}

      {capacityItems.length > 0 && (
        <section className="admin-capacity-section">
          <div className="admin-capacity-section-heading">
            <Text strong>Queue</Text>
            {bulk?.job_state === 'running' &&
              !traversalComplete &&
              bulk.current_page != null && (
              <Text className={ADMIN_TEXT_MUTED}>
                Scanning page {bulk.current_page + 1}
              </Text>
              )}
          </div>
          {backpressureMessage && (
            <div className="admin-capacity-notice">{backpressureMessage}</div>
          )}
          <div className="admin-capacity-grid">
            {capacityItems.map((item) => (
              <CapacityMeter key={item.label} {...item} />
            ))}
          </div>
        </section>
      )}

      <Row gutter={[20, 20]}>
        {metrics.map((metric) => (
          <Col key={metric.key} xs={12} sm={8} md={6} lg={4}>
            <Tooltip title={metric.hint} placement="top">
              <div className="admin-progress-stat">
                <Statistic
                  title={metric.title}
                  value={metric.value}
                  styles={{ content: metric.valueStyle }}
                  className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
                />
              </div>
            </Tooltip>
          </Col>
        ))}
      </Row>

      {showThroughput && bulk && (
        <Row gutter={[20, 20]} className="mt-5">
          <Col span={8}>
            <Statistic
              title="Ready rate"
              value={(bulk.documents_per_second ?? 0) * 60}
              precision={1}
              suffix="/ min"
              className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
            />
          </Col>
          <Col span={8}>
            <Tooltip title={`${bulk.total_staged_for_rag} file(s) prepared and waiting to be sent for indexing.`}>
              <div className="admin-progress-stat">
                <Statistic
                  title="Queue depth"
                  value={bulk.total_staged_for_rag}
                  className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
                />
              </div>
            </Tooltip>
          </Col>
          <Col span={8}>
            <Statistic
              title="ETA"
              value={formatEta(bulk.estimated_seconds_remaining)}
              className={`${ADMIN_STAT_VALUE} ${ADMIN_STAT_TITLE}`}
            />
          </Col>
        </Row>
      )}

      {(lastUpdate || onRefresh) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          {lastUpdate ? (
            <Text className={`${ADMIN_TEXT_MUTED} admin-pipeline-progress-meta`}>{lastUpdate}</Text>
          ) : (
            <span />
          )}
          {onRefresh && (
            <AdminRefreshButton loading={isRefreshing} onClick={onRefresh} />
          )}
        </div>
      )}
      </AdminCard>
      <AdminConfirmDialog
        open={pauseConfirmOpen}
        title="Pause pipeline?"
        description="Stops scanning for new files and sending new documents for indexing. Files already in progress keep going."
        confirmText="Pause"
        loading={pauseMutation.isPending}
        onCancel={() => setPauseConfirmOpen(false)}
        onConfirm={() => void pauseConfirmed()}
      />
    </>
  )
}
