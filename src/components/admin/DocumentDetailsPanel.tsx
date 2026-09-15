import { AdminRefreshIcon } from '../../icons/admin'
import { App, Button, Descriptions, Drawer, Spin, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminDocument, retryDocument } from '../../api/admin'
import { ADMIN_DOCUMENT_POLL_MS } from '../../config/admin'
import { ADMIN_EMPTY, ADMIN_TEXT_BODY, ADMIN_TEXT_ERROR, ADMIN_TEXT_MUTED } from '../../config/adminStyles'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import {
  formatDateTime,
  isTerminalLifecycle,
  LIFECYCLE_HINTS,
  LIFECYCLE_LABELS,
} from '../../utils/lifecycle'
import DocumentStatusBadge from './DocumentStatusBadge'
import IngestionPipelineWaterfall from './IngestionPipelineWaterfall'
import type { LifecycleStatus } from '../../api/types/admin'

const { Text, Paragraph } = Typography

interface DocumentDetailsPanelProps {
  docId: string | null
  open: boolean
  onClose: () => void
}

export default function DocumentDetailsPanel({ docId, open, onClose }: DocumentDetailsPanelProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: adminQueryKeys.document(docId ?? ''),
    queryFn: ({ signal }) => fetchAdminDocument(docId!, signal),
    enabled: open && Boolean(docId),
    refetchInterval: (query) => {
      const status = query.state.data?.lifecycle_status
      if (!status || isTerminalLifecycle(status as LifecycleStatus)) return false
      return ADMIN_DOCUMENT_POLL_MS
    },
  })

  const retryMutation = useMutation({
    mutationFn: () => retryDocument(docId!),
    onSuccess: (result) => {
      message.success(`Retry scheduled (${result.retried} workflow${result.retried === 1 ? '' : 's'})`)
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.document(docId!) })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'documents'] })
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview })
    },
    onError: (err: Error) => message.error(err.message),
  })

  return (
    <Drawer
      title={data?.filename ?? `Document ${docId}`}
      open={open}
      onClose={onClose}
      width={560}
      extra={
        data?.lifecycle_status === 'FAILED' ? (
          <Button
            type="primary"
            icon={<AdminRefreshIcon />}
            loading={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
          >
            Retry Document
          </Button>
        ) : null
      }
    >
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      )}
      {isError && (
        <Paragraph type="danger">{(error as Error).message || 'Failed to load document'}</Paragraph>
      )}
      {data && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 p-4">
            <IngestionPipelineWaterfall status={data.lifecycle_status} doc={data} compact={false} />
            <div className="mt-3 flex items-center gap-2">
              <DocumentStatusBadge status={data.lifecycle_status} />
              <Text type="secondary" className={ADMIN_TEXT_BODY}>
                {LIFECYCLE_HINTS[data.lifecycle_status as LifecycleStatus] ??
                  LIFECYCLE_LABELS[data.lifecycle_status as LifecycleStatus]}
              </Text>
            </div>
            {isFetching && !isLoading && (
              <Text type="secondary" className={`block mt-1 ${ADMIN_TEXT_MUTED}`}>
                Refreshing
              </Text>
            )}
          </div>

          {data.lifecycle_status === 'FAILED' && data.last_error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <Text strong className="text-red-700">
                Failure
              </Text>
              <Paragraph className={`!mb-0 mt-1 ${ADMIN_TEXT_ERROR}`}>{data.last_error}</Paragraph>
              {data.last_error_code && (
                <Text type="secondary" className={ADMIN_TEXT_MUTED}>
                  Code: {data.last_error_code}
                </Text>
              )}
            </div>
          )}

          <Descriptions column={1} size="small" title="LogicalDOC">
            <Descriptions.Item label="docId">{data.source_document_id}</Descriptions.Item>
            <Descriptions.Item label="Folder / path">{data.file_path ?? ADMIN_EMPTY}</Descriptions.Item>
            <Descriptions.Item label="Folder ID">{data.source_folder_id ?? ADMIN_EMPTY}</Descriptions.Item>
            <Descriptions.Item label="Version">{data.source_file_version ?? ADMIN_EMPTY}</Descriptions.Item>
            <Descriptions.Item label="Checksum">{data.checksum ?? ADMIN_EMPTY}</Descriptions.Item>
          </Descriptions>

          <Descriptions column={1} size="small" title="Ingestion timeline">
            <Descriptions.Item label="Discovered">{formatDateTime(data.discovered_at)}</Descriptions.Item>
            <Descriptions.Item label="Queued">{formatDateTime(data.queued_at)}</Descriptions.Item>
            <Descriptions.Item label="Submitted">{formatDateTime(data.submitted_at)}</Descriptions.Item>
            <Descriptions.Item label="Ready">{formatDateTime(data.ready_at)}</Descriptions.Item>
            <Descriptions.Item label="Failed">{formatDateTime(data.failed_at)}</Descriptions.Item>
            <Descriptions.Item label="MinIO staged">{data.minio_staged ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Processing stage">{data.processing_stage ?? ADMIN_EMPTY}</Descriptions.Item>
          </Descriptions>

          <Descriptions column={1} size="small" title="RAG">
            <Descriptions.Item label="RAG item ID">{data.rag_document_id ?? ADMIN_EMPTY}</Descriptions.Item>
            <Descriptions.Item label="Indexed">
              {data.lifecycle_status === 'READY' ? 'Yes' : 'No'}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions column={1} size="small" title="Retry & orchestration">
            <Descriptions.Item label="Retry count">{data.retry_count}</Descriptions.Item>
            <Descriptions.Item label="Discovery source">{data.discovery_source ?? ADMIN_EMPTY}</Descriptions.Item>
            <Descriptions.Item label="Temporal workflow">
              {data.temporal_workflow_id ?? ADMIN_EMPTY}
            </Descriptions.Item>
            <Descriptions.Item label="Last failure">{formatDateTime(data.last_failure_at)}</Descriptions.Item>
          </Descriptions>
        </div>
      )}
    </Drawer>
  )
}
