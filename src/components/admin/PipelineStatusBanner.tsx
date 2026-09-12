import { AdminRefreshIcon } from '../../icons/admin'
import { Button, Typography } from 'antd'
import type { IngestionOverview } from '../../api/types/admin'
import { ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import { derivePipelineStatus, type PipelinePhase } from '../../utils/pipelineStatus'
import { formatRelativeTime } from '../../utils/lifecycle'

const { Text } = Typography

interface PipelineStatusBannerProps {
  overview: IngestionOverview
  dataUpdatedAt?: number
  isFetching?: boolean
  onRefresh?: () => void
}

function bannerTone(phase: PipelinePhase): 'success' | 'info' | 'error' {
  if (phase === 'failed') return 'error'
  if (phase === 'idle') return 'info'
  return 'success'
}

export default function PipelineStatusBanner({
  overview,
  dataUpdatedAt,
  isFetching,
  onRefresh,
}: PipelineStatusBannerProps) {
  const status = derivePipelineStatus(overview)
  const tone = bannerTone(status.phase)
  const updatedLabel =
    dataUpdatedAt != null ? `Updated ${formatRelativeTime(new Date(dataUpdatedAt).toISOString())}` : null

  return (
    <div className="admin-pipeline-banner-wrap">
      <div className={`admin-pipeline-banner admin-pipeline-banner--${tone}`}>
        <div className="admin-pipeline-banner-icon" aria-hidden />
        <div className="admin-pipeline-banner-content">
          <div className="admin-pipeline-banner-header">
            <div className="admin-pipeline-banner-title-group">
              <span className="admin-pipeline-banner-title">{status.label}</span>
              {status.isActive && (
                <span className="admin-pipeline-banner-live">
                  <span className="admin-pipeline-live-dot" aria-hidden />
                  Live
                </span>
              )}
            </div>
            {onRefresh && (
              <Button
                size="small"
                className="admin-pipeline-banner-refresh"
                icon={<AdminRefreshIcon />}
                loading={isFetching}
                onClick={onRefresh}
              >
                Refresh
              </Button>
            )}
          </div>
          <p className="admin-pipeline-banner-detail">{status.detail}</p>
        </div>
      </div>
      {updatedLabel && (
        <Text className={`admin-pipeline-banner-meta ${ADMIN_TEXT_MUTED}`}>
          {updatedLabel}
          {status.isActive ? ' · auto-refreshes every few seconds while work is in flight' : ''}
        </Text>
      )}
    </div>
  )
}
