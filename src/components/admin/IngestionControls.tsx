import {
  ExportOutlined,
  PauseCircleFilled,
  PlayCircleFilled,
  SyncOutlined,
  TagsFilled,
} from '@ant-design/icons'
import { App, Button, Popconfirm, Tag, Typography } from 'antd'
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
} from '../../api/admin'
import type { IngestionOverview } from '../../api/types/admin'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import { ADMIN_TEXT_DESC, ADMIN_TEXT_LABEL, ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import AdminCard from './AdminCard'

const { Text } = Typography

const CONTROL_BTN = 'admin-control-btn'

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

interface ControlRowProps {
  title: string
  description: string
  status?: ReactNode
  action: ReactNode
}

function ControlRow({ title, description, status, action }: ControlRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_5.75rem] items-center gap-x-4 gap-y-2 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Text className={ADMIN_TEXT_LABEL}>{title}</Text>
          {status}
        </div>
        <Text className={`block mt-1 ${ADMIN_TEXT_DESC}`}>{description}</Text>
      </div>
      <div className="flex justify-end">{action}</div>
    </div>
  )
}

function ControlButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="small"
      className={`${CONTROL_BTN}${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}

export default function IngestionControls({ overview }: IngestionControlsProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview })
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
      const parts: string[] = []
      if (result.discovery_resumed) parts.push('discovery resumed')
      if (result.ingestion_resumed) parts.push('ingestion resumed')
      if (result.bulk_started) parts.push('bulk crawl started')
      message.success(parts.length ? parts.join(', ') : 'Pipeline already running')
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
  const bulkIdle = !overview.bulk_progress || overview.bulk_progress.job_state === 'idle'

  return (
    <AdminCard title="Controls">
      <div className="divide-y divide-[#eef1f5]">
        <ControlRow
          title="Run all"
          description="Resume paused stages and start bulk crawl when idle."
          action={
            <ControlButton
              icon={<PlayCircleFilled />}
              loading={resumeAllMutation.isPending}
              onClick={() => resumeAllMutation.mutate()}
            >
              Run all
            </ControlButton>
          }
        />

        <ControlRow
          title="Discovery"
          description="Scan LogicalDOC folders and register new documents for ingestion."
          status={stateTag(overview.discovery_state)}
          action={
            discoveryPaused ? (
              <ControlButton
                icon={<PlayCircleFilled />}
                loading={resumeDiscoveryMutation.isPending}
                onClick={() => resumeDiscoveryMutation.mutate()}
              >
                Resume
              </ControlButton>
            ) : (
              <Popconfirm
                title="Pause discovery?"
                description="Folder traversal and new document discovery stop."
                onConfirm={() => pauseDiscoveryMutation.mutate()}
              >
                <ControlButton
                  icon={<PauseCircleFilled />}
                  loading={pauseDiscoveryMutation.isPending}
                >
                  Pause
                </ControlButton>
              </Popconfirm>
            )
          }
        />

        <ControlRow
          title="Ingestion"
          description="Prepare documents, submit to RAG, and track indexing through MQ events."
          status={stateTag(overview.ingestion_state)}
          action={
            ingestionPaused ? (
              <ControlButton
                icon={<PlayCircleFilled />}
                loading={resumeIngestionMutation.isPending}
                onClick={() => resumeIngestionMutation.mutate()}
              >
                Resume
              </ControlButton>
            ) : (
              <Popconfirm
                title="Pause ingestion?"
                description="New RAG submissions stop. In flight indexing continues."
                onConfirm={() => pauseIngestionMutation.mutate()}
              >
                <ControlButton
                  icon={<PauseCircleFilled />}
                  loading={pauseIngestionMutation.isPending}
                >
                  Pause
                </ControlButton>
              </Popconfirm>
            )
          }
        />

        <ControlRow
          title="Bulk crawl"
          description="Start a full folder traversal when no bulk job is running."
          status={stateTag(bulkIdle ? 'idle' : 'RUNNING')}
          action={
            <ControlButton
              icon={<PlayCircleFilled />}
              loading={resumeAllMutation.isPending}
              disabled={!bulkIdle}
              onClick={() => resumeAllMutation.mutate()}
            >
              Start
            </ControlButton>
          }
        />

        <ControlRow
          title="Retry failed"
          description="Requeue up to 500 failed documents for another ingest attempt."
          status={<Tag>{overview.counts.failed.toLocaleString()} failed</Tag>}
          action={
            <ControlButton
              icon={<SyncOutlined />}
              loading={retryFailedMutation.isPending}
              disabled={overview.counts.failed === 0}
              onClick={() => retryFailedMutation.mutate()}
            >
              Retry
            </ControlButton>
          }
        />

        <ControlRow
          title="Classify missing"
          description="Run the RAG classifier on READY documents without a category label."
          action={
            <ControlButton
              icon={<TagsFilled />}
              loading={classifyMutation.isPending}
              onClick={() => classifyMutation.mutate()}
            >
              Run
            </ControlButton>
          }
        />

        <ControlRow
          title="AI chat session"
          description="Mint a new operator chat session using adapter LogicalDOC access."
          action={
            <ControlButton
              icon={<ExportOutlined />}
              loading={chatSessionMutation.isPending}
              onClick={() => chatSessionMutation.mutate()}
            >
              Open
            </ControlButton>
          }
        />
      </div>

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
  )
}
