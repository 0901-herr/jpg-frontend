import { AdminPauseIcon, AdminPlayIcon } from '../../icons/admin'
import { App, Button, Popconfirm, Select, Switch, Tag, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  classifyMissingDocuments,
  mintAdminChatSession,
  pauseDiscovery,
  pauseIngestion,
  resumeAllIngestion,
  resumeDiscovery,
  resumeIngestion,
  retryFailedDocuments,
  startBulkCrawl,
  triggerAuditPoll,
  triggerReconciliation,
  updateIngestionSyncSettings,
} from '../../api/admin'
import type { IngestionOverview } from '../../api/types/admin'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import {
  ADMIN_STACK_SPACE,
  ADMIN_TEXT_DESC,
  ADMIN_TEXT_LABEL,
  ADMIN_TEXT_MUTED,
} from '../../config/adminStyles'
import { formatRelativeTime } from '../../utils/lifecycle'
import { derivePipelineStatus } from '../../utils/pipelineStatus'
import AdminCard from './AdminCard'

const { Text } = Typography

const CONTROL_BTN = 'admin-control-btn'

const RECONCILE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Every hour' },
  { value: 24, label: 'Daily' },
  { value: 168, label: 'Weekly' },
]

interface IngestionControlsProps {
  overview: IngestionOverview
}

type RowTone = 'success' | 'warning' | 'error' | 'default'

function stateTone(state: string): RowTone {
  if (state === 'RUNNING') return 'success'
  if (state === 'PAUSED') return 'warning'
  if (state === 'DEGRADED' || state === 'ERROR') return 'error'
  return 'default'
}

function stateTag(state: string) {
  const tone = stateTone(state)
  const color =
    tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'error' ? 'error' : 'default'
  return <Tag color={color === 'default' ? undefined : color}>{state}</Tag>
}

function ControlGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-[#eef1f5]">{children}</div>
}

interface ControlRowProps {
  title: string
  description: string
  status?: ReactNode
  settings?: ReactNode
  action: ReactNode
}

function ControlRow({ title, description, status, settings, action }: ControlRowProps) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 py-4 first:pt-0 last:pb-0 ${
        settings ? 'items-start' : 'items-center'
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Text className={ADMIN_TEXT_LABEL}>{title}</Text>
          {status}
        </div>
        <Text className={`block mt-1 ${ADMIN_TEXT_DESC}`}>{description}</Text>
        {settings ? <div className="mt-2 flex items-center gap-2">{settings}</div> : null}
      </div>
      <div className={`flex justify-end shrink-0${settings ? ' pt-0.5' : ''}`}>{action}</div>
    </div>
  )
}

interface IconControlButtonProps extends Omit<React.ComponentProps<typeof Button>, 'icon' | 'children'> {
  label: string
  icon: ReactNode
}

function IconControlButton({ label, icon, className, ...props }: IconControlButtonProps) {
  return (
    <Button
      size="small"
      icon={icon}
      aria-label={label}
      title={label}
      className={`${CONTROL_BTN}${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}

function reconcileLabel(hours: number): string {
  return RECONCILE_OPTIONS.find((option) => option.value === hours)?.label ?? `${hours}h`
}

export default function IngestionControls({ overview }: IngestionControlsProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { sync } = overview

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview })
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.activityEvents })
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const pauseIngestionMutation = useMutation({
    mutationFn: () => pauseIngestion(),
    onSuccess: () => {
      message.success('Ingestion paused')
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const resumeIngestionMutation = useMutation({
    mutationFn: () => resumeIngestion(),
    onSuccess: () => {
      message.success('Ingestion running')
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const pauseDiscoveryMutation = useMutation({
    mutationFn: () => pauseDiscovery(),
    onSuccess: () => {
      message.success('Discovery paused')
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const resumeDiscoveryMutation = useMutation({
    mutationFn: () => resumeDiscovery(),
    onSuccess: () => {
      message.success('Discovery running')
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const resumeAllMutation = useMutation({
    mutationFn: () => resumeAllIngestion(),
    onSuccess: (result) => {
      if (result.bulk_started) {
        message.success('Bulk crawl started — documents will appear as they are discovered.')
      } else if (result.catch_up_scheduled) {
        message.warning(
          'Bulk did not start; incremental catch-up is running. See Activity tab for progress and errors.',
          6,
        )
      } else if (result.discovery_resumed || result.ingestion_resumed) {
        message.success('Pipeline resumed.')
      } else {
        message.info('Pipeline already running.')
      }
      invalidate()
    },
    onError: (err: Error) => {
      message.error(`Start ingesting failed: ${err.message}`, 8)
      invalidate()
    },
  })

  const bulkStartMutation = useMutation({
    mutationFn: () => startBulkCrawl(),
    onSuccess: (result) => {
      if (result.bulk_started) {
        message.success('Bulk crawl started — watch the Documents tab for new rows.')
      } else {
        message.warning('Bulk crawl did not start — it may already be running. Check Activity tab.', 6)
      }
      invalidate()
    },
    onError: (err: Error) => {
      message.error(`Bulk crawl failed: ${err.message}`, 8)
      invalidate()
    },
  })

  const syncSettingsMutation = useMutation({
    mutationFn: (settings: {
      audit_sync_enabled?: boolean
      reconciliation_interval_hours?: number
    }) => updateIngestionSyncSettings(settings),
    onSuccess: () => {
      message.success('Sync settings updated')
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const auditPollMutation = useMutation({
    mutationFn: () => triggerAuditPoll(),
    onSuccess: (result) => {
      message.success(
        `Audit poll: ${result.docs_queued} queued, ${result.events_read} events read`,
      )
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const reconcileMutation = useMutation({
    mutationFn: () => triggerReconciliation(),
    onSuccess: (result) => {
      message.success(
        `Reconciliation: ${result.queued_for_ingest} queued, ${result.missing_in_adapter} missing`,
      )
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const retryFailedMutation = useMutation({
    mutationFn: () => retryFailedDocuments(),
    onSuccess: (result) => {
      message.success(`Scheduled ${result.retried} retries`)
      invalidate()
    },
    onError: (err: Error) => message.error(err.message),
  })

  const classifyMutation = useMutation({
    mutationFn: () => classifyMissingDocuments(10),
    onSuccess: (result) => {
      message.success(
        result.queued ? `Queued ${result.queued} for classification` : 'No documents need classification',
      )
    },
    onError: (err: Error) => message.error(err.message),
  })

  const chatSessionMutation = useMutation({
    mutationFn: () => mintAdminChatSession(),
    onSuccess: (result) => {
      const url =
        result.session_url ??
        `/api/auth/session?exchange=${encodeURIComponent(result.exchange_token)}`
      window.location.assign(url)
    },
    onError: (err: Error) => message.error(err.message),
  })

  const ingestionPaused = overview.ingestion_state === 'PAUSED'
  const discoveryPaused = overview.discovery_state === 'PAUSED'
  const bulkJobState = overview.bulk_progress?.job_state ?? 'idle'
  const bulkRunning = bulkJobState === 'running'
  const bulkCanStart = !bulkRunning
  const bulkFailed = bulkJobState === 'failed'
  const bulkError = overview.bulk_progress?.job_error
  const bulkStatusLabel =
    bulkJobState === 'running'
      ? 'RUNNING'
      : bulkJobState === 'failed'
        ? 'ERROR'
        : bulkJobState === 'completed'
          ? 'RUNNING'
          : bulkJobState
  const bulkFailureNote = bulkFailed
    ? `Last bulk crawl failed${bulkError ? `: ${bulkError}` : '.'} Play to retry.`
    : null
  const pipelineStatus = derivePipelineStatus(overview)
  const startIngestingActive = pipelineStatus.isActive

  return (
    <div className={ADMIN_STACK_SPACE}>
      <AdminCard title="Pipeline">
        <ControlGroup>
          <ControlRow
            title="Start ingesting"
            description={bulkFailureNote ?? pipelineStatus.detail}
            status={
              startIngestingActive ? (
                <Tag color="processing">{pipelineStatus.label}</Tag>
              ) : bulkFailed ? (
                stateTag('ERROR')
              ) : undefined
            }
            action={
              <IconControlButton
                label={startIngestingActive ? 'Pipeline running' : 'Start ingesting'}
                icon={<AdminPlayIcon />}
                loading={resumeAllMutation.isPending || bulkRunning}
                disabled={startIngestingActive}
                onClick={() => resumeAllMutation.mutate()}
              />
            }
          />
          <ControlRow
            title="Discovery"
            description="Play: scan folders and register new documents. Pause: stop traversal and registration."
            status={stateTag(overview.discovery_state)}
            action={
              discoveryPaused ? (
                <IconControlButton
                  label="Resume discovery"
                  icon={<AdminPlayIcon />}
                  loading={resumeDiscoveryMutation.isPending}
                  onClick={() => resumeDiscoveryMutation.mutate()}
                />
              ) : (
                <Popconfirm
                  title="Pause discovery?"
                  description="Folder traversal and new document discovery stop."
                  onConfirm={() => pauseDiscoveryMutation.mutate()}
                >
                  <IconControlButton
                    label="Pause discovery"
                    icon={<AdminPauseIcon />}
                    loading={pauseDiscoveryMutation.isPending}
                  />
                </Popconfirm>
              )
            }
          />
          <ControlRow
            title="Ingestion"
            description="Play: submit documents to RAG. Pause: block new submissions; in-flight jobs continue."
            status={stateTag(overview.ingestion_state)}
            action={
              ingestionPaused ? (
                <IconControlButton
                  label="Resume ingestion"
                  icon={<AdminPlayIcon />}
                  loading={resumeIngestionMutation.isPending}
                  onClick={() => resumeIngestionMutation.mutate()}
                />
              ) : (
                <Popconfirm
                  title="Pause ingestion?"
                  description="New RAG submissions stop. In flight indexing continues."
                  onConfirm={() => pauseIngestionMutation.mutate()}
                >
                  <IconControlButton
                    label="Pause ingestion"
                    icon={<AdminPauseIcon />}
                    loading={pauseIngestionMutation.isPending}
                  />
                </Popconfirm>
              )
            }
          />
        </ControlGroup>
        {(ingestionPaused || discoveryPaused) && (
          <div className="mt-4 pt-4 border-t border-[#eef1f5] space-y-1">
            {discoveryPaused && (
              <Text className={`block ${ADMIN_TEXT_MUTED}`}>
                Discovery pause: {overview.discovery_pause_reason ?? 'manual'}
              </Text>
            )}
            {ingestionPaused && (
              <Text className={`block ${ADMIN_TEXT_MUTED}`}>
                Ingestion pause:{' '}
                {overview.ingestion_pause_reason ??
                  (overview.circuit_open ? 'RAG circuit open' : 'manual')}
              </Text>
            )}
          </div>
        )}
      </AdminCard>

      <AdminCard title="Initial corpus">
        <ControlGroup>
          <ControlRow
            title="Bulk crawl"
            description={
              bulkFailureNote ?? 'Play: full folder traversal for initial load or corpus rebuild.'
            }
            status={stateTag(bulkStatusLabel)}
            action={
              <IconControlButton
                label="Start bulk crawl"
                icon={<AdminPlayIcon />}
                loading={bulkStartMutation.isPending}
                disabled={!bulkCanStart}
                onClick={() => bulkStartMutation.mutate()}
              />
            }
          />
        </ControlGroup>
      </AdminCard>

      <AdminCard title="Change detection">
        <ControlGroup>
          <ControlRow
            title="Audit changelog"
            description={`Play: poll Audit history now. Auto polls every ${Math.round(sync.audit_poll_interval_seconds)}s when enabled. Last poll ${overview.last_audit_poll_at ? formatRelativeTime(overview.last_audit_poll_at) : 'never'}.`}
            status={
              <Tag color={sync.audit_sync_enabled ? 'success' : 'default'}>
                {sync.audit_sync_enabled ? 'Auto on' : 'Auto off'}
              </Tag>
            }
            settings={
              <Switch
                size="small"
                checked={sync.audit_sync_enabled}
                loading={syncSettingsMutation.isPending}
                onChange={(checked) =>
                  syncSettingsMutation.mutate({ audit_sync_enabled: checked })
                }
              />
            }
            action={
              <IconControlButton
                label="Poll audit changelog"
                icon={<AdminPlayIcon />}
                loading={auditPollMutation.isPending}
                onClick={() => auditPollMutation.mutate()}
              />
            }
          />
          <ControlRow
            title="Reconciliation"
            description={`Play: compare LogicalDOC doc IDs vs adapter and queue missing ones. Last run ${overview.last_reconciliation_at ? formatRelativeTime(overview.last_reconciliation_at) : 'never'}. Env default: ${reconcileLabel(sync.reconciliation_env_hours)}.`}
            status={
              <Tag color={sync.reconciliation_interval_hours > 0 ? 'processing' : 'default'}>
                {sync.reconciliation_interval_hours > 0
                  ? reconcileLabel(sync.reconciliation_interval_hours)
                  : 'Off'}
              </Tag>
            }
            settings={
              <Select
                size="small"
                className="min-w-[7.5rem]"
                value={sync.reconciliation_interval_hours}
                options={RECONCILE_OPTIONS}
                loading={syncSettingsMutation.isPending}
                onChange={(value) =>
                  syncSettingsMutation.mutate({ reconciliation_interval_hours: value })
                }
              />
            }
            action={
              <IconControlButton
                label="Run reconciliation"
                icon={<AdminPlayIcon />}
                loading={reconcileMutation.isPending}
                onClick={() => reconcileMutation.mutate()}
              />
            }
          />
        </ControlGroup>
      </AdminCard>

      <AdminCard title="Maintenance">
        <ControlGroup>
          <ControlRow
            title="Retry failed"
            description="Play: requeue up to 500 failed documents for another ingest attempt."
            status={<Tag>{overview.counts.failed.toLocaleString()} failed</Tag>}
            action={
              <IconControlButton
                label="Retry failed documents"
                icon={<AdminPlayIcon />}
                loading={retryFailedMutation.isPending}
                disabled={overview.counts.failed === 0}
                onClick={() => retryFailedMutation.mutate()}
              />
            }
          />
          <ControlRow
            title="Classify missing"
            description="Play: run the RAG classifier on READY documents without a category label."
            action={
              <IconControlButton
                label="Classify missing documents"
                icon={<AdminPlayIcon />}
                loading={classifyMutation.isPending}
                onClick={() => classifyMutation.mutate()}
              />
            }
          />
        </ControlGroup>
      </AdminCard>

      <AdminCard title="Operator">
        <ControlGroup>
          <ControlRow
            title="AI chat session"
            description="Play: open operator chat using adapter LogicalDOC credentials."
            action={
              <IconControlButton
                label="Open AI chat session"
                icon={<AdminPlayIcon />}
                loading={chatSessionMutation.isPending}
                onClick={() => chatSessionMutation.mutate()}
              />
            }
          />
        </ControlGroup>
      </AdminCard>
    </div>
  )
}
