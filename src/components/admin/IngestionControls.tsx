import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { App, Button, Card, Popconfirm, Space, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  pauseDiscovery,
  pauseIngestion,
  resumeDiscovery,
  resumeIngestion,
} from '../../api/admin'
import type { IngestionOverview } from '../../api/types/admin'
import { ADMIN_CARD_CLASS } from '../../config/adminStyles'
import { adminQueryKeys } from '../../lib/adminQueryKeys'

const { Paragraph, Text } = Typography

interface IngestionControlsProps {
  overview: IngestionOverview
}

export default function IngestionControls({ overview }: IngestionControlsProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview })
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

  const ingestionPaused = overview.ingestion_state === 'PAUSED'
  const discoveryPaused = overview.discovery_state === 'PAUSED'

  return (
    <Card title="Controls" className={ADMIN_CARD_CLASS}>
      <Paragraph type="secondary" className="!mb-4 text-sm">
        Pausing ingestion stops new RAG submissions. Documents already submitted continue indexing.
        MQ completion events still update status.
      </Paragraph>
      <Space wrap>
        {ingestionPaused ? (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={resumeIngestionMutation.isPending}
            onClick={() => resumeIngestionMutation.mutate()}
          >
            Resume Ingestion
          </Button>
        ) : (
          <Popconfirm
            title="Pause ingestion?"
            description="New submissions to RAG will stop. In-flight indexing continues."
            onConfirm={() => pauseIngestionMutation.mutate()}
          >
            <Button
              danger
              icon={<PauseCircleOutlined />}
              loading={pauseIngestionMutation.isPending}
            >
              Pause Ingestion
            </Button>
          </Popconfirm>
        )}

        {discoveryPaused ? (
          <Button
            icon={<PlayCircleOutlined />}
            loading={resumeDiscoveryMutation.isPending}
            onClick={() => resumeDiscoveryMutation.mutate()}
          >
            Resume Discovery
          </Button>
        ) : (
          <Popconfirm
            title="Pause discovery?"
            description="BFS folder traversal and new document discovery will stop."
            onConfirm={() => pauseDiscoveryMutation.mutate()}
          >
            <Button icon={<PauseCircleOutlined />} loading={pauseDiscoveryMutation.isPending}>
              Pause Discovery
            </Button>
          </Popconfirm>
        )}
      </Space>
      {(overview.ingestion_state === 'PAUSED' || overview.discovery_state === 'PAUSED') && (
        <div className="mt-3">
          {ingestionPaused && (
            <Text type="secondary" className="block text-sm">
              Ingestion pause reason: {overview.ingestion_pause_reason ?? (overview.circuit_open ? 'RAG circuit open' : 'manual')}
            </Text>
          )}
          {discoveryPaused && (
            <Text type="secondary" className="block text-sm">
              Discovery pause reason: {overview.discovery_pause_reason ?? 'manual'}
            </Text>
          )}
        </div>
      )}
    </Card>
  )
}
